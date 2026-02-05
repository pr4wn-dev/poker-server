# Simulation Monitor - Updates every 10 seconds
# Shows current game state, recent actions, errors, and key events

$logFile = "logs\game.log"
$updateInterval = 10

Write-Host "=== SIMULATION MONITOR ===" -ForegroundColor Green
Write-Host "Updates every $updateInterval seconds. Press Ctrl+C to stop.`n" -ForegroundColor Yellow

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "`n[$timestamp] === STATUS UPDATE ===" -ForegroundColor Cyan
    
    if (Test-Path $logFile) {
        # Get recent log entries
        $recent = Get-Content $logFile -Tail 100
        
        # Extract current phase
        $phaseLine = $recent | Select-String -Pattern '"phase":"([^"]+)"' | Select-Object -Last 1
        $currentPhase = if ($phaseLine) { 
            if ($phaseLine -match '"phase":"([^"]+)"') { $matches[1] } else { "Unknown" }
        } else { "Unknown" }
        
        # Extract hand number
        $handLine = $recent | Select-String -Pattern '"handNumber":(\d+)' | Select-Object -Last 1
        $handNumber = if ($handLine) {
            if ($handLine -match '"handNumber":(\d+)') { $matches[1] } else { "N/A" }
        } else { "N/A" }
        
        # Count recent actions
        $actionCount = ($recent | Select-String -Pattern "HANDLE_ACTION|CALL|RAISE|FOLD|BET|CHECK").Count
        
        # Count errors
        $errorCount = ($recent | Select-String -Pattern "\[ERROR\]|\[ROOT CAUSE\]").Count
        
        # Check for item ante activity
        $itemAnteActive = ($recent | Select-String -Pattern "ITEM_ANTE" | Select-Object -Last 1) -ne $null
        
        # Get player count
        $playerLine = $recent | Select-String -Pattern '"activePlayers":(\d+)' | Select-Object -Last 1
        $playerCount = if ($playerLine) {
            if ($playerLine -match '"activePlayers":(\d+)') { $matches[1] } else { "?" }
        } else { "?" }
        
        # Display status
        Write-Host "  Phase: " -NoNewline -ForegroundColor White
        Write-Host $currentPhase -ForegroundColor Yellow
        Write-Host "  Hand: " -NoNewline -ForegroundColor White
        Write-Host $handNumber -ForegroundColor Yellow
        Write-Host "  Players: " -NoNewline -ForegroundColor White
        Write-Host $playerCount -ForegroundColor Yellow
        Write-Host "  Recent Actions: " -NoNewline -ForegroundColor White
        Write-Host $actionCount -ForegroundColor $(if ($actionCount -gt 0) { "Green" } else { "Gray" })
        Write-Host "  Errors: " -NoNewline -ForegroundColor White
        Write-Host $errorCount -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
        Write-Host "  Item Ante: " -NoNewline -ForegroundColor White
        Write-Host $(if ($itemAnteActive) { "Active" } else { "None" }) -ForegroundColor $(if ($itemAnteActive) { "Yellow" } else { "Gray" })
        
        # Show last 3 key events
        $keyEvents = $recent | Select-String -Pattern "\[TRACE\]|\[ERROR\]|ITEM_ANTE|eliminated|winner" | Select-Object -Last 3
        if ($keyEvents) {
            Write-Host "`n  --- Recent Events ---" -ForegroundColor DarkGray
            foreach ($event in $keyEvents) {
                $eventTime = if ($event -match '\[(\d{2}:\d{2}:\d{2})') { $matches[1] } else { "" }
                $eventType = if ($event -match '\[TRACE\]\s+(\w+)') { $matches[1] }
                            elseif ($event -match '\[ERROR\]') { "ERROR" }
                            elseif ($event -match 'ITEM_ANTE') { "ITEM_ANTE" }
                            elseif ($event -match 'eliminated') { "ELIMINATED" }
                            elseif ($event -match 'winner') { "WINNER" }
                            else { "EVENT" }
                Write-Host "    [$eventTime] $eventType" -ForegroundColor DarkCyan
            }
        }
    } else {
        Write-Host "  Log file not found. Waiting..." -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds $updateInterval
}
