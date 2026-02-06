# Automated Issue Monitoring System
# Monitors logs continuously, detects issues, pauses Unity, and waits for fixes
# Displays real-time statistics in a formatted layout
#
# Usage: .\monitoring\monitor.ps1
# This script runs continuously until stopped (Ctrl+C)

$ErrorActionPreference = "Continue"

# Ensure we're in the correct directory (poker-server root)
# Script is in monitoring/ folder, so go up one level
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:projectRoot = Split-Path -Parent $scriptDir
Set-Location $script:projectRoot

# Configuration - use absolute paths to prevent directory issues
$logFile = Join-Path $script:projectRoot "logs\game.log"
$pendingIssuesFile = Join-Path $script:projectRoot "logs\pending-issues.json"
$checkInterval = 1  # Check every 1 second
$nodeScript = Join-Path $script:projectRoot "monitoring\issue-detector.js"
$serverUrl = "http://localhost:3000"
$statsUpdateInterval = 10  # Update stats display every 10 seconds (reduced frequency to prevent flickering)

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
$lastServerCheck = Get-Date  # Track last server health check
$previousStats = @{}  # Track previous stats values to only update when changed
$script:consoleOutputStartLine = 0  # Will be set by Show-Statistics
$script:maxConsoleLines = 15  # Maximum number of console output lines to keep visible
$script:consoleLineCount = 0  # Track how many console lines we've written

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
    LastIssueLogged = $null
    PauseMarkersWritten = 0
    PauseMarkerErrors = 0
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

# Function to write console output without causing scrolling
function Write-ConsoleOutput {
    param(
        [string]$Message,
        [string]$ForegroundColor = "White"
    )
    
    # If console output area hasn't been initialized, skip
    if ($script:consoleOutputStartLine -eq 0) {
        return
    }
    
    # Check if we've exceeded max console lines - if so, clear and reset
    if ($script:consoleLineCount -ge $script:maxConsoleLines) {
        # Clear the console output area
        $windowHeight = [Console]::WindowHeight
        $startClearLine = $script:consoleOutputStartLine
        $endClearLine = [Math]::Min($windowHeight - 1, $script:consoleOutputStartLine + $script:maxConsoleLines)
        
        for ($line = $startClearLine; $line -le $endClearLine; $line++) {
            [Console]::SetCursorPosition(0, $line)
            Write-Host (" " * [Console]::WindowWidth) -NoNewline
        }
        
        # Reset console line count
        $script:consoleLineCount = 0
    }
    
    # Calculate current console output line
    $currentConsoleLine = $script:consoleOutputStartLine + $script:consoleLineCount
    
    # Make sure we don't go past window height
    $windowHeight = [Console]::WindowHeight
    if ($currentConsoleLine -ge $windowHeight - 1) {
        # Reset - clear and start over
        $startClearLine = $script:consoleOutputStartLine
        $endClearLine = [Math]::Min($windowHeight - 1, $script:consoleOutputStartLine + $script:maxConsoleLines)
        
        for ($line = $startClearLine; $line -le $endClearLine; $line++) {
            [Console]::SetCursorPosition(0, $line)
            Write-Host (" " * [Console]::WindowWidth) -NoNewline
        }
        
        $script:consoleLineCount = 0
        $currentConsoleLine = $script:consoleOutputStartLine
    }
    
    # Truncate message to window width to prevent wrapping (leave 2 chars margin)
    $maxMessageLength = [Console]::WindowWidth - 2
    $truncatedMessage = if ($Message.Length -gt $maxMessageLength) {
        $Message.Substring(0, $maxMessageLength - 3) + "..."
    } else {
        $Message
    }
    
    # Write the message (hide cursor during write to prevent flicker)
    [Console]::CursorVisible = $false
    [Console]::SetCursorPosition(0, $currentConsoleLine)
    Write-Host $truncatedMessage -ForegroundColor $ForegroundColor
    
    # Increment line count
    $script:consoleLineCount++
    
    # Track when we wrote console output
    $script:lastConsoleOutputTime = Get-Date
    
    # Return cursor to top for stats (but don't update stats immediately)
    # Restore cursor visibility
    [Console]::SetCursorPosition(0, 0)
    [Console]::CursorVisible = $true
}

# Function to get fix attempts stats
function Get-FixAttemptsStats {
    $fixAttemptsFile = Join-Path $script:projectRoot "fix-attempts.txt"
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
    
    # Check server status and ensure it's running
    $stats.ServerStatus = if (Test-ServerRunning) { "Online" } else { "Offline" }
    
    # If server is offline, attempt to start it immediately
    if ($stats.ServerStatus -eq "Offline") {
        # Don't write to console - update stats display instead
        # Write-Warning "Server is offline. Attempting to start..."
        $restartResult = Start-ServerIfNeeded
        if ($restartResult) {
            # Re-check status after restart attempt
            Start-Sleep -Seconds 2
            $stats.ServerStatus = if (Test-ServerRunning) { "Online" } else { "Offline" }
        }
    }
    
    # Create a snapshot of current stats for comparison
    $currentStatsSnapshot = @{
        TotalLinesProcessed = $stats.TotalLinesProcessed
        IssuesDetected = $stats.IssuesDetected
        PendingIssues = $pendingCount
        ServerStatus = $stats.ServerStatus
        LogFileSize = $stats.LogFileSize
        IsPaused = $isPaused
        Uptime = $uptimeStr
    }
    
    # Only update display if stats actually changed (reduces flickering)
    $statsChanged = $true
    if ($script:previousStats.Count -gt 0) {
        $statsChanged = $false
        foreach ($key in $currentStatsSnapshot.Keys) {
            if ($currentStatsSnapshot[$key] -ne $script:previousStats[$key]) {
                $statsChanged = $true
                break
            }
        }
    }
    
    # Skip update if nothing changed (unless it's the first display)
    if (-not $statsChanged -and $script:firstDisplay -ne $null) {
        return
    }
    
    # Save current stats for next comparison
    $script:previousStats = $currentStatsSnapshot
    
    # Only clear screen on first display, then update in place
    if ($script:firstDisplay -eq $null) {
        Clear-Host
        $script:firstDisplay = $true
    } else {
        # Move cursor to top (line 0) to overwrite stats in place
        # Use a small delay to ensure cursor position is stable
        [Console]::CursorVisible = $false  # Hide cursor during update to reduce flicker
        [Console]::SetCursorPosition(0, 0)
        Start-Sleep -Milliseconds 10  # Small delay for stability
    }
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
    
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Pause Markers: " -NoNewline -ForegroundColor White
    Write-Host ("{0:N0}" -f $stats.PauseMarkersWritten) -NoNewline -ForegroundColor $(if ($stats.PauseMarkersWritten -gt 0) { "Green" } else { "Gray" })
    if ($stats.PauseMarkerErrors -gt 0) {
        Write-Host " (Errors: $($stats.PauseMarkerErrors))" -NoNewline -ForegroundColor Red
    }
    Write-Host (" " * 30) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
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
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Action: PAUSED - Waiting for fix..." -ForegroundColor Yellow
        Write-Host (" " * 30) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
    }
    
    Write-Host "+==============================================================================+" -ForegroundColor Cyan
    
    # Calculate where console output should start (below stats)
    $statsHeight = [Console]::CursorTop + 1
    $script:consoleOutputStartLine = $statsHeight
    
    # Reset console line count when stats are redrawn (keeps console output fresh)
    $script:consoleLineCount = 0
    
    # Clear the console output area to prevent old text from showing
    $windowHeight = [Console]::WindowHeight
    $consoleAreaStart = $script:consoleOutputStartLine
    $consoleAreaEnd = [Math]::Min($windowHeight - 1, $consoleAreaStart + $script:maxConsoleLines)
    
    for ($line = $consoleAreaStart; $line -le $consoleAreaEnd; $line++) {
        [Console]::SetCursorPosition(0, $line)
        Write-Host (" " * [Console]::WindowWidth) -NoNewline
    }
    
    # Move cursor back to top (line 0) for next update - this keeps stats visible
    [Console]::SetCursorPosition(0, 0)
    
    # Restore cursor visibility
    [Console]::CursorVisible = $true
}

# Function to start server if not running
function Start-ServerIfNeeded {
    if (-not (Test-ServerRunning)) {
        # Don't write to console - update stats display instead
        # Write-Warning "Server is not running. Starting server..."
        try {
            # Kill any existing node processes first
            Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            
            # Start server in background
            $serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start" -WindowStyle Minimized -PassThru
            # Don't write to console - update stats display instead
            # Write-Info "Server starting (PID: $($serverProcess.Id)). Waiting for server to be ready..."
            
            # Wait up to 30 seconds for server to start
            $maxWait = 30
            $waited = 0
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 2
                $waited += 2
                if (Test-ServerRunning) {
                    # Don't write to console - update stats display instead
                    # Write-Success "Server is now online!"
                    return $true
                }
            }
            # Don't write to console - update stats display instead
            # Write-Error "Server failed to start within $maxWait seconds"
            return $false
        } catch {
            # Don't write to console - update stats display instead
            # Write-Error "Failed to start server: $_"
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
                
                # Skip our own monitoring logs and internal system logs
                if ($line -match '\[MONITORING\]|\[ISSUE_DETECTOR\]|\[LOG_WATCHER\]|\[TRACE\]|\[STATUS_REPORT\]|\[ACTIVE_MONITORING\]|\[WORKFLOW\]') {
                    continue
                }
                
                # Skip FIX_ATTEMPT SUCCESS logs (these are good, not errors)
                if ($line -match '\[FIX_ATTEMPT\].*SUCCESS') {
                    continue
                }
                
                # Skip TRACE logs (informational only)
                # BUT: Don't skip [ROOT_TRACE] - these are important error indicators
                if ($line -match '\[TRACE\]' -and $line -notmatch '\[ROOT_TRACE\]') {
                    continue
                }
                
                # Check for issues using Node.js detector
                $issue = Invoke-IssueDetector $line
                
                if ($issue) {
                    # REPORT TO CONSOLE: Issue detected (but not yet paused)
                    # Use Write-ConsoleOutput to prevent scrolling and flickering
                    $issueMessage = "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTED: $($issue.type) ($($issue.severity))"
                    Write-ConsoleOutput -Message $issueMessage -ForegroundColor "Yellow"
                    
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
                        # Don't write to console - update stats display instead
                        # Write-Error "ISSUE DETECTED: $($issue.message.Substring(0, [Math]::Min(100, $issue.message.Length)))"
                        # Write-Error "  Type: $($issue.type), Severity: $($issue.severity), Source: $($issue.source)"
                        
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
                            # Update stats to show issue was logged
                            $stats.LastIssueLogged = Get-Date
                            
                            # REPORT TO CONSOLE: Issue detected (write below stats, not overlapping)
                            $issueMessage = "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTED: $($issue.type) ($($issue.severity))"
                            Write-ConsoleOutput -Message $issueMessage -ForegroundColor "Yellow"
                            
                            $messagePreview = "  Message: $($line.Substring(0, [Math]::Min(100, $line.Length)))"
                            Write-ConsoleOutput -Message $messagePreview -ForegroundColor "Gray"
                            
                            if ($tableId) {
                                Write-ConsoleOutput -Message "  Table ID: $tableId" -ForegroundColor "Cyan"
                            }
                            
                            # CRITICAL: Write a special log entry that the log watcher will detect to pause Unity
                            # This ensures Unity pauses immediately when monitor detects an issue
                            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
                            $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                            $pauseMarker = "[$timestamp] [GAME] [MONITOR] [CRITICAL_ISSUE_DETECTED] Issue detected by monitor - pausing Unity | Data: {`"issueId`":`"$($addResult.issueId)`",`"severity`":`"$($issue.severity)`",`"type`":`"$($issue.type)`",`"source`":`"$($issue.source)`",`"tableId`":$(if($tableId){`"$tableId`"}else{'null'}),`"message`":`"$escapedMessage`"}"
                            
                            # Write pause marker to log file
                            try {
                                Add-Content -Path $logFile -Value $pauseMarker -ErrorAction Stop
                                $stats.PauseMarkersWritten++
                                Write-ConsoleOutput -Message "  Pause marker written to game.log" -ForegroundColor "Green"
                                Write-ConsoleOutput -Message "  Waiting for log watcher to pause Unity..." -ForegroundColor "Yellow"
                            } catch {
                                # If writing fails, log it but continue
                                $stats.PauseMarkerErrors++
                                Write-ConsoleOutput -Message "  ERROR: Failed to write pause marker: $_" -ForegroundColor "Red"
                            }
                            
                            $isPaused = $true
                            $currentIssue = $line
                        } else {
                            if ($addResult -and $addResult.reason -eq 'duplicate') {
                                # Don't write to console - update stats display instead
                                # Write-Info "Duplicate issue detected (already logged)"
                                # CRITICAL: Even for duplicates, if Unity isn't paused yet, we should pause it
                                # This ensures Unity stops logging and gives user time to report the issue
                                if (-not $isPaused) {
                                    # Don't write to console - update stats display instead
                                    # Write-Warning "Unity not paused yet - triggering pause for duplicate issue"
                                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
                                    $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                                    $pauseMarker = "[$timestamp] [GAME] [MONITOR] [CRITICAL_ISSUE_DETECTED] Duplicate issue - pausing Unity to stop logging | Data: {`"issueId`":`"duplicate`",`"severity`":`"$($issue.severity)`",`"type`":`"$($issue.type)`",`"source`":`"$($issue.source)`",`"tableId`":$(if($tableId){`"$tableId`"}else{'null'}),`"message`":`"$escapedMessage`"}"
                                    Add-Content -Path $logFile -Value $pauseMarker -ErrorAction SilentlyContinue
                                    $isPaused = $true
                                    $currentIssue = $line
                                }
                            } else {
                                $errorMsg = if ($addResult -and $addResult.error) { $addResult.error } else { "Unknown error - check Node.js script output" }
                                # Don't write to console - update stats display instead
                                # Write-Error "Failed to log issue: $errorMsg"
                                # Write-Warning "Issue detected but not logged. Check issue-detector.js for errors."
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
                # Don't write to console - update stats display instead
                # Write-Success "All issues fixed! Resuming monitoring..."
                $isPaused = $false
                $currentIssue = $null
            }
        }
        
        # Check server status continuously and restart if needed (every 5 seconds)
        $now = Get-Date
        $serverCheckInterval = 5  # Check server every 5 seconds
        
        # Check server health every 5 seconds (independent of stats display)
        if (($now - $lastServerCheck).TotalSeconds -ge $serverCheckInterval) {
            if (-not (Test-ServerRunning)) {
                # Don't write to console - update stats display instead
                # Write-Warning "Server is offline. Attempting to restart..."
                $restartResult = Start-ServerIfNeeded
                if (-not $restartResult) {
                    # Don't write to console - update stats display instead
                    # Write-Error "Failed to restart server. Will retry in $serverCheckInterval seconds..."
                } else {
                    # Re-check after restart attempt
                    Start-Sleep -Seconds 2
                    if (Test-ServerRunning) {
                        # Don't write to console - update stats display instead
                        # Write-Success "Server restarted successfully!"
                    }
                }
            }
            $lastServerCheck = $now
        }
        
        # Update statistics display periodically
        # BUT: Don't update if we just wrote console output (prevents flashing)
        # Only update if console output line hasn't changed recently (increased to 3 seconds for stability)
        $timeSinceLastConsoleOutput = if ($script:lastConsoleOutputTime) { ($now - $script:lastConsoleOutputTime).TotalSeconds } else { 999 }
        if (($now - $lastStatsUpdate).TotalSeconds -ge $statsUpdateInterval -and $timeSinceLastConsoleOutput -gt 3) {
            Show-Statistics
            $lastStatsUpdate = $now
        }
        
    } catch {
        Write-Error "Monitoring error: $_"
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Info "Monitoring stopped"
