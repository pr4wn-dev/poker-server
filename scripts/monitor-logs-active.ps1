# Active log monitoring - reports issues directly to assistant
$logFile = "logs\game.log"
$lastPos = 0
$issueCount = 0

Write-Host "`n=== ACTIVE MONITORING STARTED ===" -ForegroundColor Green
Write-Host "Monitoring: $logFile" -ForegroundColor Cyan
Write-Host "Checking every 2 seconds..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path $logFile) {
    $lastPos = (Get-Item $logFile).Length
}

while ($true) {
    Start-Sleep -Seconds 2
    
    if (Test-Path $logFile) {
        $currSize = (Get-Item $logFile).Length
        
        if ($currSize -gt $lastPos) {
            $newLines = Get-Content $logFile -Tail 100 | Select-String -Pattern "\[FIX\] DISABLED|SIMULATION BOT TIMEOUT|\[TIMER\].*TIMEOUT|\[ERROR\]|\[ROOT CAUSE\]|\[ROOT_TRACE\].*TOTAL_BET_NOT_CLEARED|\[ROOT_TRACE\].*PLAYER_WON_MORE_THAN_CONTRIBUTED|isPaused.*true" | Select-Object -Last 5
            
            if ($newLines) {
                foreach ($line in $newLines) {
                    $issueCount++
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    
                    if ($line -match '\[FIX\] DISABLED') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: FIX DISABLED" -ForegroundColor Red
                        if ($line -match 'fixId":"([^"]+)"') {
                            Write-Host "  Fix ID: $($matches[1])" -ForegroundColor Yellow
                        }
                        if ($line -match '"reason":"([^"]+)"') {
                            Write-Host "  Reason: $($matches[1])" -ForegroundColor Yellow
                        }
                    }
                    elseif ($line -match 'SIMULATION BOT TIMEOUT') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: BOT TIMEOUT" -ForegroundColor Red
                        if ($line -match '"player":"([^"]+)"') {
                            Write-Host "  Player: $($matches[1])" -ForegroundColor Yellow
                        }
                    }
                    elseif ($line -match '\[TIMER\].*TIMEOUT') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: TURN TIMEOUT" -ForegroundColor Red
                    }
                    elseif ($line -match '\[ERROR\]|\[ROOT CAUSE\]') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: ERROR DETECTED" -ForegroundColor Red
                    }
                    elseif ($line -match '\[ROOT_TRACE\].*TOTAL_BET_NOT_CLEARED') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: TOTAL_BET_NOT_CLEARED" -ForegroundColor Red
                    }
                    elseif ($line -match '\[ROOT_TRACE\].*PLAYER_WON_MORE_THAN_CONTRIBUTED') {
                        Write-Host "`n[$timestamp] ISSUE #$issueCount: PLAYER_WON_MORE_THAN_CONTRIBUTED" -ForegroundColor Red
                    }
                    elseif ($line -match 'isPaused.*true') {
                        Write-Host "`n[$timestamp] WARNING: SIMULATION IS PAUSED" -ForegroundColor Yellow
                    }
                }
            }
            
            $lastPos = $currSize
        }
    }
    else {
        Start-Sleep -Seconds 5
    }
}
