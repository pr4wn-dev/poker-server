# Simple 10-second update script
$logFile = "logs\game.log"

Write-Host "=== SIMULATION MONITOR - Updates Every 10 Seconds ===" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Yellow

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "`n[$timestamp] === STATUS ===" -ForegroundColor Cyan
    
    if (Test-Path $logFile) {
        $recent = Get-Content $logFile -Tail 50
        $lastLine = $recent[-1]
        
        # Extract info from last line
        $hand = if ($lastLine -match '"handNumber":(\d+)') { $matches[1] } else { "?" }
        $phase = if ($lastLine -match '"phase":"([^"]+)"') { $matches[1] } else { "?" }
        $players = if ($lastLine -match '"activePlayers":(\d+)') { $matches[1] } else { "?" }
        $pot = if ($lastLine -match '"pot":(\d+)') { $matches[1] } else { "?" }
        
        # Count recent actions
        $actions = ($recent | Select-String -Pattern "HANDLE_ACTION|CALL|RAISE|FOLD|BET|CHECK").Count
        $errors = ($recent | Select-String -Pattern "\[ERROR\]|\[ROOT CAUSE\]").Count
        
        Write-Host "  Hand: $hand" -ForegroundColor Yellow
        Write-Host "  Phase: $phase" -ForegroundColor Yellow
        Write-Host "  Players: $players" -ForegroundColor Yellow
        Write-Host "  Pot: $pot" -ForegroundColor Yellow
        Write-Host "  Actions (last 50 lines): $actions" -ForegroundColor $(if ($actions -gt 0) { "Green" } else { "Gray" })
        Write-Host "  Errors: $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
        
        # Show last event
        $lastEvent = $recent | Select-String -Pattern "\[TRACE\]\s+(\w+)|\[ERROR\]|ITEM_ANTE|eliminated|winner" | Select-Object -Last 1
        if ($lastEvent) {
            $eventType = if ($lastEvent -match '\[TRACE\]\s+(\w+)') { $matches[1] }
                        elseif ($lastEvent -match '\[ERROR\]') { "ERROR" }
                        else { "EVENT" }
            Write-Host "  Last Event: $eventType" -ForegroundColor DarkCyan
        }
    } else {
        Write-Host "  Log file not found" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 10
}
