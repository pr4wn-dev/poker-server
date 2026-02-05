# Enhanced simulation monitor with failure detection
# Alerts when simulation stops, gets stuck, or has errors

$logFile = "logs\game.log"
$checkInterval = 10
$stuckThreshold = 30  # Seconds without new logs = stuck
$alertThreshold = 60   # Seconds without logs = critical failure

Write-Host "=== ENHANCED SIMULATION MONITOR ===" -ForegroundColor Green
Write-Host "Detects:" -ForegroundColor Yellow
Write-Host "  ✓ Simulation stopped (no new logs)" -ForegroundColor White
Write-Host "  ✓ Simulation stuck (same hand/phase)" -ForegroundColor White
Write-Host "  ✓ Critical errors" -ForegroundColor White
Write-Host "  ✓ Server crashes" -ForegroundColor White
Write-Host "`nChecking every $checkInterval seconds...`n" -ForegroundColor Cyan

$lastLogSize = 0
$lastHand = -1
$lastPhase = ""
$lastLogTime = $null
$sameStateCount = 0
$alertsSent = @{}

function Get-LastLogTime {
    param($logContent)
    $lastLine = $logContent[-1]
    if ($lastLine -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
        try {
            $timeStr = $matches[1]
            if ($timeStr -match '\.\d+$') {
                return [DateTime]::ParseExact($timeStr, "yyyy-MM-dd HH:mm:ss.fff", $null)
            } else {
                return [DateTime]::ParseExact($timeStr, "yyyy-MM-dd HH:mm:ss", $null)
            }
        } catch {
            return $null
        }
    }
    return $null
}

function Get-CurrentState {
    param($logContent)
    $handLine = $logContent | Select-String -Pattern '"handNumber":(\d+)' | Select-Object -Last 1
    $phaseLine = $logContent | Select-String -Pattern '"phase":"([^"]+)"' | Select-Object -Last 1
    
    $hand = if ($handLine -match '"handNumber":(\d+)') { [int]$matches[1] } else { -1 }
    $phase = if ($phaseLine -match '"phase":"([^"]+)"') { $matches[1] } else { "" }
    
    return @{ Hand = $hand; Phase = $phase }
}

while ($true) {
    Start-Sleep -Seconds $checkInterval
    $now = Get-Date
    
    if (-not (Test-Path $logFile)) {
        Write-Host "[$($now.ToString('HH:mm:ss'))] ⚠️ Log file not found!" -ForegroundColor Red
        continue
    }
    
    $currentLogSize = (Get-Item $logFile).Length
    $recent = Get-Content $logFile -Tail 100
    $currentState = Get-CurrentState $recent
    $lastLogTime = Get-LastLogTime $recent
    
    # Check if log file is growing
    if ($currentLogSize -eq $lastLogSize) {
        if ($lastLogTime) {
            $timeSinceLastLog = ($now - $lastLogTime).TotalSeconds
            
            if ($timeSinceLastLog -gt $alertThreshold) {
                $alertKey = "STOPPED"
                if (-not $alertsSent[$alertKey]) {
                    Write-Host "`n[$($now.ToString('HH:mm:ss'))] 🚨🚨🚨 SIMULATION STOPPED! 🚨🚨🚨" -ForegroundColor Red
                    Write-Host "  No new logs for $([math]::Round($timeSinceLastLog, 1)) seconds" -ForegroundColor Red
                    Write-Host "  Last Hand: $($currentState.Hand) | Last Phase: $($currentState.Phase)" -ForegroundColor Yellow
                    Write-Host "  Last Log Time: $($lastLogTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Yellow
                    Write-Host "  ACTION REQUIRED: Check server status!" -ForegroundColor Red
                    $alertsSent[$alertKey] = $true
                }
            } elseif ($timeSinceLastLog -gt $stuckThreshold) {
                $alertKey = "STUCK"
                if (-not $alertsSent[$alertKey]) {
                    Write-Host "`n[$($now.ToString('HH:mm:ss'))] ⚠️ SIMULATION STUCK!" -ForegroundColor Yellow
                    Write-Host "  No new logs for $([math]::Round($timeSinceLastLog, 1)) seconds" -ForegroundColor Yellow
                    Write-Host "  Last Hand: $($currentState.Hand) | Last Phase: $($currentState.Phase)" -ForegroundColor Yellow
                    $alertsSent[$alertKey] = $true
                }
            }
        }
    } else {
        # Log file is growing - simulation is active
        $alertsSent.Clear()  # Reset alerts when activity resumes
        
        # Check for state progression
        if ($currentState.Hand -ne -1) {
            if ($currentState.Hand -eq $lastHand -and $currentState.Phase -eq $lastPhase) {
                $sameStateCount++
                if ($sameStateCount -gt 6) {  # 60 seconds in same state
                    Write-Host "[$($now.ToString('HH:mm:ss'))] ⚠️ Same state for $($sameStateCount * $checkInterval) seconds" -ForegroundColor Yellow
                    Write-Host "  Hand: $($currentState.Hand) | Phase: $($currentState.Phase)" -ForegroundColor Yellow
                }
            } else {
                $sameStateCount = 0
                if ($lastHand -ne -1) {
                    Write-Host "[$($now.ToString('HH:mm:ss'))] ✓ Progress: Hand $lastHand → $($currentState.Hand), Phase: $lastPhase → $($currentState.Phase)" -ForegroundColor Green
                }
            }
        }
        
        $lastHand = $currentState.Hand
        $lastPhase = $currentState.Phase
        $lastLogSize = $currentLogSize
        
        # Check for critical errors
        $criticalErrors = $recent | Select-String -Pattern "Uncaught Exception|FATAL|CRITICAL|simulation.*stopped|simulation.*failed" -CaseSensitive:$false
        if ($criticalErrors) {
            Write-Host "`n[$($now.ToString('HH:mm:ss'))] 🚨 CRITICAL ERROR!" -ForegroundColor Red
            $criticalErrors | Select-Object -Last 2 | ForEach-Object {
                Write-Host "  $_" -ForegroundColor Red
            }
        }
    }
    
    # Status update every minute
    if ($now.Second -lt $checkInterval) {
        $status = "Active"
        $color = "Green"
        if ($lastLogTime) {
            $timeSince = ($now - $lastLogTime).TotalSeconds
            if ($timeSince -gt $alertThreshold) {
                $status = "STOPPED"
                $color = "Red"
            } elseif ($timeSince -gt $stuckThreshold) {
                $status = "STUCK"
                $color = "Yellow"
            }
        }
        Write-Host "[$($now.ToString('HH:mm:ss'))] Status: $status | Hand: $($currentState.Hand) | Phase: $($currentState.Phase)" -ForegroundColor $color
    }
}
