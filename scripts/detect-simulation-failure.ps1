# Detect when simulation stops or fails
# Monitors for: no new logs, stuck phase, errors, no progress

$logFile = "logs\game.log"
$checkInterval = 10
$stuckThreshold = 30  # Seconds without new logs = stuck
$maxErrors = 5  # Max errors before alerting

Write-Host "=== SIMULATION FAILURE DETECTOR ===" -ForegroundColor Green
Write-Host "Monitoring for:" -ForegroundColor Yellow
Write-Host "  - No new log entries (stuck)" -ForegroundColor White
Write-Host "  - Phase not changing (stuck in phase)" -ForegroundColor White
Write-Host "  - Hand not progressing" -ForegroundColor White
Write-Host "  - Too many errors" -ForegroundColor White
Write-Host "`nChecking every $checkInterval seconds...`n" -ForegroundColor Cyan

$lastLogSize = 0
$lastHand = -1
$lastPhase = ""
$lastLogTime = Get-Date
$errorCount = 0
$stuckCount = 0

while ($true) {
    Start-Sleep -Seconds $checkInterval
    
    if (-not (Test-Path $logFile)) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠️ Log file not found!" -ForegroundColor Red
        continue
    }
    
    $currentLogSize = (Get-Item $logFile).Length
    $recent = Get-Content $logFile -Tail 100
    
    # Check if new logs appeared
    if ($currentLogSize -eq $lastLogSize) {
        $stuckCount++
        $timeSinceLastLog = (Get-Date - $lastLogTime).TotalSeconds
        
        if ($timeSinceLastLog -gt $stuckThreshold) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 🚨 SIMULATION STUCK!" -ForegroundColor Red
            Write-Host "  No new logs for $([math]::Round($timeSinceLastLog, 1)) seconds" -ForegroundColor Red
            Write-Host "  Last Hand: $lastHand | Last Phase: $lastPhase" -ForegroundColor Yellow
        }
    } else {
        $stuckCount = 0
        $lastLogSize = $currentLogSize
        $lastLogTime = Get-Date
        
        # Extract current state
        $handLine = $recent | Select-String -Pattern '"handNumber":(\d+)' | Select-Object -Last 1
        $phaseLine = $recent | Select-String -Pattern '"phase":"([^"]+)"' | Select-Object -Last 1
        $timeLine = $recent | Select-String -Pattern '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})' | Select-Object -Last 1
        
        $currentHand = if ($handLine -match '"handNumber":(\d+)') { [int]$matches[1] } else { -1 }
        $currentPhase = if ($phaseLine -match '"phase":"([^"]+)"') { $matches[1] } else { "" }
        
        # Check for hand progression
        if ($currentHand -ne -1 -and $lastHand -ne -1) {
            if ($currentHand -eq $lastHand -and $stuckCount -gt 3) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠️ Hand stuck at $currentHand" -ForegroundColor Yellow
            } elseif ($currentHand -gt $lastHand) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Hand progressed: $lastHand → $currentHand" -ForegroundColor Green
            }
        }
        
        # Check for phase changes
        if ($currentPhase -ne "" -and $lastPhase -ne "") {
            if ($currentPhase -ne $lastPhase) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Phase changed: $lastPhase → $currentPhase" -ForegroundColor Green
            }
        }
        
        $lastHand = $currentHand
        $lastPhase = $currentPhase
        
        # Count errors
        $recentErrors = ($recent | Select-String -Pattern "\[ERROR\]|\[ROOT CAUSE\]|Uncaught Exception").Count
        if ($recentErrors -gt $maxErrors) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 🚨 TOO MANY ERRORS: $recentErrors" -ForegroundColor Red
            $errorCount++
        } else {
            $errorCount = 0
        }
        
        # Check for critical errors
        $criticalErrors = $recent | Select-String -Pattern "Uncaught Exception|FATAL|CRITICAL|simulation.*stopped|simulation.*failed" -CaseSensitive:$false
        if ($criticalErrors) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 🚨 CRITICAL ERROR DETECTED!" -ForegroundColor Red
            $criticalErrors | Select-Object -Last 3 | ForEach-Object {
                Write-Host "  $_" -ForegroundColor Red
            }
        }
    }
    
    # Summary every minute
    if ((Get-Date).Second -lt $checkInterval) {
        Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Status: Hand=$lastHand, Phase=$lastPhase, Errors=$errorCount, Stuck=$stuckCount" -ForegroundColor DarkGray
    }
}
