# PowerShell script to poll logs and show what the assistant should be reporting
# This reads the game.log file and extracts status reports and issues

$logFile = "logs\game.log"
$checkInterval = 10  # Check every 10 seconds

Write-Host "=== ASSISTANT REPORT POLLER ===" -ForegroundColor Green
Write-Host "This script shows what the assistant should be reporting from the logs" -ForegroundColor Yellow
Write-Host "Checking every $checkInterval seconds...`n" -ForegroundColor Cyan

$lastPosition = 0

while ($true) {
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw
        $currentSize = (Get-Item $logFile).Length
        
        if ($currentSize -gt $lastPosition) {
            # Read new content
            $newContent = Get-Content $logFile | Select-Object -Skip ($lastPosition -gt 0 ? [math]::Floor($lastPosition / 200) : 0)
            $lastPosition = $currentSize
            
            # Look for status reports
            $statusReports = $newContent | Select-String -Pattern "STATUS_REPORT|REPORT_MARKER|reportToUser.*true" -Context 0,2
            
            # Look for issues detected
            $issues = $newContent | Select-String -Pattern "ISSUE_DETECTED|WORKFLOW.*STEP|PAUSING_UNITY|RESUMING_UNITY" -Context 0,1
            
            # Look for simulation detection
            $simulations = $newContent | Select-String -Pattern "NEW_SIMULATION_DETECTED|EXISTING_SIMULATION_DETECTED" -Context 0,1
            
            $timestamp = Get-Date -Format "HH:mm:ss"
            
            if ($statusReports -or $issues -or $simulations) {
                Write-Host "`n[$timestamp] === NEW ACTIVITY ===" -ForegroundColor Cyan
                
                if ($simulations) {
                    Write-Host "`n  SIMULATIONS:" -ForegroundColor Green
                    $simulations | ForEach-Object {
                        $line = $_.Line
                        if ($line -match '"message":"([^"]+)"') {
                            Write-Host "    - $($matches[1])" -ForegroundColor Yellow
                        }
                    }
                }
                
                if ($statusReports) {
                    Write-Host "`n  STATUS REPORTS:" -ForegroundColor Green
                    $statusReports | Select-Object -Last 1 | ForEach-Object {
                        $line = $_.Line
                        if ($line -match '"message":"([^"]+)"') {
                            Write-Host "    $($matches[1])" -ForegroundColor Yellow
                        }
                        if ($line -match '"activeSimulations":(\d+)') {
                            Write-Host "    Active Simulations: $($matches[1])" -ForegroundColor $(if ([int]$matches[1] -gt 0) { 'Green' } else { 'Gray' })
                        }
                    }
                }
                
                if ($issues) {
                    Write-Host "`n  ISSUES DETECTED:" -ForegroundColor Red
                    $issues | Select-Object -Last 3 | ForEach-Object {
                        $line = $_.Line
                        if ($line -match '"issueType":"([^"]+)"') {
                            Write-Host "    - $($matches[1])" -ForegroundColor Red
                        } elseif ($line -match "\[WORKFLOW\].*STEP") {
                            Write-Host "    - $($line.Substring(0, [Math]::Min(80, $line.Length)))" -ForegroundColor Yellow
                        }
                    }
                }
            }
        }
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Waiting for log file..." -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds $checkInterval
}
