# Automated Issue Monitoring System
# Monitors logs continuously, detects issues, pauses Unity, and waits for fixes
# Displays real-time statistics in a formatted layout
#
# Usage: .\monitoring\monitor.ps1
# This script runs continuously until stopped (Ctrl+C)

$ErrorActionPreference = "Continue"

# Configuration
$logFile = "logs\game.log"
$pendingIssuesFile = "logs\pending-issues.json"
$checkInterval = 1  # Check every 1 second
$nodeScript = "monitoring\issue-detector.js"
$serverUrl = "http://localhost:3000"
$statsUpdateInterval = 5  # Update stats display every 5 seconds

# Colors for output
function Write-Status { param($message, $color = "White") Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" -ForegroundColor $color }
function Write-Info { param($message) Write-Status $message "Cyan" }
function Write-Success { param($message) Write-Status $message "Green" }
function Write-Warning { param($message) Write-Status $message "Yellow" }
function Write-Error { param($message) Write-Status $message "Red" }

# State tracking
$lastLogPosition = 0
$isPaused = $false
$currentIssue = $null
$monitoringActive = $true

# Statistics tracking
$stats = @{
    StartTime = Get-Date
    TotalLinesProcessed = 0
    IssuesDetected = 0
    IssuesBySeverity = @{
        critical = 0
        high = 0
        medium = 0
        low = 0
    }
    IssuesBySource = @{
        server = 0
        unity = 0
        database = 0
        network = 0
    }
    UniquePatterns = @{}
    FixAttempts = 0
    FixesSucceeded = 0
    FixesFailed = 0
    PendingIssues = 0
    LastIssueTime = $null
    LogFileSize = 0
    ServerStatus = "Unknown"
}

# Function to call Node.js issue detector
function Invoke-IssueDetector {
    param($logLine)
    
    try {
        # Escape the log line for PowerShell
        $escapedLine = $logLine -replace '"', '""'
        $result = node $nodeScript --check "$escapedLine" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result) {
            $jsonResult = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($jsonResult) {
                return $jsonResult
            }
        }
    } catch {
        # If Node.js script fails, fall back to basic pattern matching
        return $null
    }
    return $null
}

# Function to add issue via Node.js
function Add-PendingIssue {
    param($issueData)
    
    try {
        $jsonData = $issueData | ConvertTo-Json -Compress
        $result = node $nodeScript --add-issue $jsonData 2>&1
        if ($LASTEXITCODE -eq 0 -and $result) {
            $jsonResult = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
            return $jsonResult
        }
    } catch {
        return $null
    }
    return $null
}

# Function to get pending issues count
function Get-PendingIssuesCount {
    if (Test-Path $pendingIssuesFile) {
        try {
            $content = Get-Content $pendingIssuesFile -Raw | ConvertFrom-Json
            return ($content.issues | Measure-Object).Count
        } catch {
            return 0
        }
    }
    return 0
}

# Function to get fix attempts stats
function Get-FixAttemptsStats {
    $fixAttemptsFile = "fix-attempts.txt"
    if (Test-Path $fixAttemptsFile) {
        try {
            $content = Get-Content $fixAttemptsFile -Raw
            $lines = $content -split "`n" | Where-Object { $_.Trim() -ne "" }
            $totalAttempts = 0
            $totalSuccesses = 0
            $totalFailures = 0
            
            foreach ($line in $lines) {
                if ($line -match 'attempts=(\d+).*successes=(\d+).*failures=(\d+)') {
                    $totalAttempts += [int]$matches[1]
                    $totalSuccesses += [int]$matches[2]
                    $totalFailures += [int]$matches[3]
                }
            }
            
            return @{
                Total = $totalAttempts
                Successes = $totalSuccesses
                Failures = $totalFailures
                SuccessRate = if ($totalAttempts -gt 0) { [math]::Round(($totalSuccesses / $totalAttempts) * 100, 1) } else { 0 }
            }
        } catch {
            return @{ Total = 0; Successes = 0; Failures = 0; SuccessRate = 0 }
        }
    }
    return @{ Total = 0; Successes = 0; Failures = 0; SuccessRate = 0 }
}

# Function to check if server is running
function Test-ServerRunning {
    try {
        # Try health endpoint with longer timeout
        $response = Invoke-WebRequest -Uri "$serverUrl/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch {
        # If health check fails, also try root endpoint as fallback
        try {
            $response = Invoke-WebRequest -Uri "$serverUrl/" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            return $true
        } catch {
            return $false
        }
    }
}

# Function to display statistics in a formatted layout
function Show-Statistics {
    $fixStats = Get-FixAttemptsStats
    $pendingCount = Get-PendingIssuesCount
    $stats.PendingIssues = $pendingCount
    
    # Calculate uptime
    $uptime = (Get-Date) - $stats.StartTime
    $uptimeStr = "{0:D2}:{1:D2}:{2:D2}" -f $uptime.Hours, $uptime.Minutes, $uptime.Seconds
    
    # Get log file size
    if (Test-Path $logFile) {
        $stats.LogFileSize = [math]::Round((Get-Item $logFile).Length / 1MB, 2)
    }
    
    # Check server status
    $stats.ServerStatus = if (Test-ServerRunning) { "Online" } else { "Offline" }
    
    # Clear screen and show header
    Clear-Host
    Write-Host "`n" -NoNewline
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    Write-Host "|" -NoNewline -ForegroundColor Cyan
    Write-Host "              AUTOMATED ISSUE MONITORING SYSTEM - LIVE STATISTICS              " -NoNewline -ForegroundColor White
    Write-Host "|" -ForegroundColor Cyan
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Monitoring Status
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "Status: " -NoNewline -ForegroundColor White
    if ($isPaused) {
        Write-Host "PAUSED (Issue Detected)" -NoNewline -ForegroundColor Red
    } else {
        Write-Host "MONITORING ACTIVE" -NoNewline -ForegroundColor Green
    }
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "Uptime: " -NoNewline -ForegroundColor White
    Write-Host $uptimeStr -NoNewline -ForegroundColor Yellow
    Write-Host (" " * (60 - $uptimeStr.Length)) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "Server: " -NoNewline -ForegroundColor White
    if ($stats.ServerStatus -eq "Online") {
        Write-Host "ONLINE" -NoNewline -ForegroundColor Green
    } else {
        Write-Host "OFFLINE" -NoNewline -ForegroundColor Red
    }
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Detection Statistics
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "DETECTION STATISTICS" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Lines Processed: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.TotalLinesProcessed) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Issues Detected: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesDetected) -NoNewline -ForegroundColor $(if ($stats.IssuesDetected -gt 0) { "Red" } else { "Green" })
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Unique Patterns: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.UniquePatterns.Count) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Log File Size: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N2} MB" -f $stats.LogFileSize) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    if ($stats.LastIssueTime) {
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Last Issue: " -NoNewline -ForegroundColor White
        Write-Host $stats.LastIssueTime.ToString("HH:mm:ss") -NoNewline -ForegroundColor Yellow
        Write-Host (" " * 40) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
    }
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Issues by Severity
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "ISSUES BY SEVERITY" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Critical: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySeverity.critical) -NoNewline -ForegroundColor Red
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  High:     " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySeverity.high) -NoNewline -ForegroundColor Yellow
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Medium:   " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySeverity.medium) -NoNewline -ForegroundColor $(if ($stats.IssuesBySeverity.medium -gt 0) { "Yellow" } else { "Gray" })
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Low:      " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySeverity.low) -NoNewline -ForegroundColor Gray
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Issues by Source
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "ISSUES BY SOURCE" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Server:   " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySource.server) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Unity:    " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySource.unity) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Database: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySource.database) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Network:  " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.IssuesBySource.network) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 50) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Fix Attempts Statistics
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "FIX ATTEMPTS STATISTICS" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Total Attempts: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $fixStats.Total) -NoNewline -ForegroundColor Cyan
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Successful:     " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $fixStats.Successes) -NoNewline -ForegroundColor Green
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Failed:         " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $fixStats.Failures) -NoNewline -ForegroundColor $(if ($fixStats.Failures -gt 0) { "Red" } else { "Gray" })
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Success Rate:   " -NoNewline -ForegroundColor White
    $successColor = if ($fixStats.SuccessRate -ge 80) { "Green" } elseif ($fixStats.SuccessRate -ge 50) { "Yellow" } else { "Red" }
    Write-Host ("{0:N1}%" -f $fixStats.SuccessRate) -NoNewline -ForegroundColor $successColor
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Current Status
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "CURRENT STATUS" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Pending Issues: " -NoNewline -ForegroundColor White
    if ($pendingCount -gt 0) {
        Write-Host ("{0:N0}" -f $pendingCount) -NoNewline -ForegroundColor Red
    } else {
        Write-Host "0" -NoNewline -ForegroundColor Green
    }
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    if ($isPaused -and $currentIssue) {
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Current Issue: " -NoNewline -ForegroundColor White
        $issuePreview = $currentIssue.Substring(0, [Math]::Min(50, $currentIssue.Length))
        Write-Host $issuePreview -NoNewline -ForegroundColor Red
        Write-Host (" " * (40 - $issuePreview.Length)) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
    }
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    Write-Host "`nPress Ctrl+C to stop monitoring`n" -ForegroundColor DarkGray
}

# Function to start server if not running
function Start-ServerIfNeeded {
    if (-not (Test-ServerRunning)) {
        Write-Warning "Server is not running. Starting server..."
        try {
            # Kill any existing node processes first
            Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            
            # Start server in background
            $serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start" -WindowStyle Minimized -PassThru
            Write-Info "Server starting (PID: $($serverProcess.Id)). Waiting for server to be ready..."
            
            # Wait up to 30 seconds for server to start
            $maxWait = 30
            $waited = 0
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 2
                $waited += 2
                if (Test-ServerRunning) {
                    Write-Success "Server is now online!"
                    return $true
                }
            }
            Write-Error "Server failed to start within $maxWait seconds"
            return $false
        } catch {
            Write-Error "Failed to start server: $_"
            return $false
        }
    }
    return $true
}

# Start server if needed before showing statistics
Start-ServerIfNeeded

# Initial display
Show-Statistics

# Main monitoring loop
$lastStatsUpdate = Get-Date
while ($monitoringActive) {
    try {
        # Check if log file exists
        if (-not (Test-Path $logFile)) {
            Start-Sleep -Seconds $checkInterval
            continue
        }
        
        # Get current log file size
        $currentSize = (Get-Item $logFile).Length
        
        # If file has grown, read new lines
        if ($currentSize -gt $lastLogPosition) {
            # Use FileShare.ReadWrite to allow concurrent writes while reading
            $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $fileStream.Position = $lastLogPosition
            $reader = New-Object System.IO.StreamReader($fileStream)
            
            while ($null -ne ($line = $reader.ReadLine())) {
                $stats.TotalLinesProcessed++
                
                # Skip our own monitoring logs
                if ($line -match '\[MONITORING\]|\[ISSUE_DETECTOR\]') {
                    continue
                }
                
                # Skip TRACE logs (informational only)
                if ($line -match '\[TRACE\]') {
                    continue
                }
                
                # Check for issues using Node.js detector
                $issue = Invoke-IssueDetector $line
                
                if ($issue) {
                    # Update statistics
                    $stats.IssuesDetected++
                    $stats.IssuesBySeverity[$issue.severity]++
                    $stats.IssuesBySource[$issue.source]++
                    $stats.LastIssueTime = Get-Date
                    
                    # Track unique patterns
                    $patternKey = $issue.type + "_" + $issue.severity
                    if (-not $stats.UniquePatterns.ContainsKey($patternKey)) {
                        $stats.UniquePatterns[$patternKey] = 0
                    }
                    $stats.UniquePatterns[$patternKey]++
                    
                    # Only pause for critical/high severity issues
                    if (($issue.severity -eq 'critical' -or $issue.severity -eq 'high') -and -not $isPaused) {
                        # Issue detected - pause Unity and log issue
                        Write-Error "ISSUE DETECTED: $($issue.message.Substring(0, [Math]::Min(100, $issue.message.Length)))"
                        Write-Error "  Type: $($issue.type), Severity: $($issue.severity), Source: $($issue.source)"
                        
                        # Extract table ID if available
                        $tableId = $null
                        if ($line -match 'tableId["\s:]+([a-f0-9-]+)') {
                            $tableId = $matches[1]
                        }
                        
                        # Add issue to pending-issues.json via Node.js
                        $issueData = @{
                            message = $line
                            source = $issue.source
                            severity = $issue.severity
                            type = $issue.type
                            tableId = $tableId
                        }
                        
                        $addResult = Add-PendingIssue $issueData
                        
                        if ($addResult -and $addResult.success) {
                            Write-Warning "Issue logged to pending-issues.json (ID: $($addResult.issueId))"
                            Write-Info "Unity will be paused automatically by server's log watcher"
                            Write-Info "Waiting for assistant to fix issue..."
                            Write-Info "Message assistant: 'issue found'"
                            
                            $isPaused = $true
                            $currentIssue = $line
                        } else {
                            if ($addResult -and $addResult.reason -eq 'duplicate') {
                                Write-Info "Duplicate issue detected (already logged)"
                            } else {
                                Write-Error "Failed to log issue: $($addResult.error)"
                            }
                        }
                    }
                }
            }
            
            $reader.Close()
            $fileStream.Close()
            $lastLogPosition = $currentSize
        }
        
        # Check if issues have been fixed (pending-issues.json is empty)
        if ($isPaused) {
            $pendingIssues = Get-PendingIssuesCount
            if ($pendingIssues -eq 0) {
                Write-Success "All issues fixed! Resuming monitoring..."
                $isPaused = $false
                $currentIssue = $null
            }
        }
        
        # Check server status and restart if needed (every 10 seconds)
        $now = Get-Date
        if (($now - $lastStatsUpdate).TotalSeconds -ge 10) {
            if (-not (Test-ServerRunning)) {
                Write-Warning "Server went offline. Attempting to restart..."
                Start-ServerIfNeeded | Out-Null
            }
        }
        
        # Update statistics display periodically
        if (($now - $lastStatsUpdate).TotalSeconds -ge $statsUpdateInterval) {
            Show-Statistics
            $lastStatsUpdate = $now
        }
        
    } catch {
        Write-Error "Monitoring error: $_"
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Info "Monitoring stopped"
