# Automated Issue Monitoring System
# Monitors logs continuously, detects issues, pauses Unity, and waits for fixes
# Displays real-time statistics in a formatted layout
#
# Usage: 
#   .\monitoring\monitor.ps1                    # Normal mode (default)
#   .\monitoring\monitor.ps1 -Mode simulation   # Simulation mode (fully automated)
#   .\monitoring\monitor.ps1 -Mode normal       # Normal mode (user creates table)
#
# Modes:
#   - simulation: Fully automated including table creation and simulation start
#   - normal: User creates table manually, everything else automated

param(
    [ValidateSet("simulation", "normal")]
    [string]$Mode = "normal"
)

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
$configFile = Join-Path $script:projectRoot "monitoring\monitor-config.json"

# Load configuration
$config = @{
    mode = $Mode
    automation = @{
        autoRestartServer = $true
        autoRestartDatabase = $true
        autoRestartUnity = $true
        autoConnectUnity = $true
        autoLogin = $true
    }
    unity = @{
        executablePath = ""
        projectPath = ""
        autoConnectOnStartup = $true
        serverUrl = $serverUrl
    }
    login = @{
        username = "monitor_user"
        password = ""
    }
    simulation = @{
        enabled = ($Mode -eq "simulation")
        tableName = "Auto Simulation"
        maxPlayers = 9
        startingChips = 10000
        smallBlind = 50
        bigBlind = 100
        autoStartSimulation = $true
    }
}

# Load config from file if it exists
if (Test-Path $configFile) {
    try {
        $fileConfig = Get-Content $configFile -Raw | ConvertFrom-Json
        if ($fileConfig.mode) { $config.mode = $fileConfig.mode }
        if ($fileConfig.automation) { $config.automation = $fileConfig.automation }
        if ($fileConfig.unity) { $config.unity = $fileConfig.unity }
        if ($fileConfig.login) { $config.login = $fileConfig.login }
        if ($fileConfig.simulation) { $config.simulation = $fileConfig.simulation }
        
        # Override mode from command line if provided
        if ($Mode -ne "normal") {
            $config.mode = $Mode
            $config.simulation.enabled = ($Mode -eq "simulation")
        }
        
        Write-Info "Loaded configuration from $configFile"
    } catch {
        Write-Warning "Failed to load config file: $_"
    }
} else {
    Write-Warning "Config file not found: $configFile - using defaults"
}

# Get password from environment variable if not in config
if (-not $config.login.password -and $env:MONITOR_PASSWORD) {
    $config.login.password = $env:MONITOR_PASSWORD
}

Write-Info "Monitor Mode: $($config.mode)"
Write-Info "Simulation Mode: $($config.simulation.enabled)"

# Colors for output
function Write-Status { param($message, $color = "White") Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" -ForegroundColor $color }
function Write-Info { param($message) Write-Status $message "Cyan" }
function Write-Success { param($message) Write-Status $message "Green" }
function Write-Warning { param($message) Write-Status $message "Yellow" }
function Write-Error { param($message) Write-Status $message "Red" }

# State tracking
# Initialize lastLogPosition to END of file so we only read NEW entries (not old ones from previous runs)
$lastLogPosition = if (Test-Path $logFile) { (Get-Item $logFile).Length } else { 0 }
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

# Function to get pending issues info (handles focus mode)
function Get-PendingIssuesInfo {
    if (Test-Path $pendingIssuesFile) {
        try {
            $content = Get-Content $pendingIssuesFile -Raw | ConvertFrom-Json
            
            # Check if in focus mode
            if ($content.focusedGroup) {
                $rootIssue = $content.focusedGroup.rootIssue
                $relatedCount = if ($content.focusedGroup.relatedIssues) { $content.focusedGroup.relatedIssues.Count } else { 0 }
                $queuedCount = if ($content.queuedIssues) { $content.queuedIssues.Count } else { 0 }
                $contextLines = if ($content.focusedGroup.contextLines) { $content.focusedGroup.contextLines } else { 0 }
                
                # Add contextLines to rootIssue for display
                if ($rootIssue) {
                    $rootIssue.contextLines = $contextLines
                }
                
                return @{
                    InFocusMode = $true
                    RootIssue = $rootIssue
                    RelatedIssuesCount = $relatedCount
                    QueuedIssuesCount = $queuedCount
                    GroupId = $content.focusedGroup.id
                    TotalIssues = 1 + $relatedCount  # Root + related
                    ContextLines = $contextLines
                }
            } else {
                # Not in focus mode
                $issueCount = if ($content.issues) { $content.issues.Count } else { 0 }
                return @{
                    InFocusMode = $false
                    TotalIssues = $issueCount
                    QueuedIssuesCount = 0
                }
            }
        } catch {
            return @{ InFocusMode = $false; TotalIssues = 0; QueuedIssuesCount = 0 }
        }
    }
    return @{ InFocusMode = $false; TotalIssues = 0; QueuedIssuesCount = 0 }
}

# Function to get pending issues count (backward compatibility)
function Get-PendingIssuesCount {
    $info = Get-PendingIssuesInfo
    return $info.TotalIssues
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

# Function to get Log Watcher status from recent logs
function Get-LogWatcherStatus {
    try {
        if (-not (Test-Path $logFile)) {
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        
        # Read last 500 lines to find recent log watcher activity
        $recentLines = Get-Content $logFile -Tail 500 -ErrorAction SilentlyContinue
        if (-not $recentLines) {
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        
        $isActive = $false
        $pausedTables = 0
        $activeSimulations = 0
        $lastSeen = $null
        
        # Look for recent LOG_WATCHER activity (within last 10 seconds)
        $now = Get-Date
        foreach ($line in $recentLines) {
            if ($line -match '\[LOG_WATCHER\]') {
                # Extract timestamp
                if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                    try {
                        $lineTime = [DateTime]::Parse($matches[1])
                        $timeDiff = ($now - $lineTime).TotalSeconds
                        
                        # If seen within last 10 seconds, consider it active
                        if ($timeDiff -le 10) {
                            $isActive = $true
                            if (-not $lastSeen -or $lineTime -gt $lastSeen) {
                                $lastSeen = $lineTime
                            }
                        }
                    } catch {
                        # If timestamp parsing fails, just check if line exists
                        $isActive = $true
                    }
                } else {
                    # No timestamp but has LOG_WATCHER - assume active
                    $isActive = $true
                }
                
                # Extract paused tables count
                if ($line -match '"pausedTablesCount":(\d+)') {
                    $pausedTables = [Math]::Max($pausedTables, [int]$matches[1])
                }
                
                # Extract active simulations count
                if ($line -match '"activeSimulationsCount":(\d+)') {
                    $activeSimulations = [Math]::Max($activeSimulations, [int]$matches[1])
                } elseif ($line -match '"simulationTablesFound":(\d+)') {
                    $activeSimulations = [Math]::Max($activeSimulations, [int]$matches[1])
                }
            }
        }
        
        return @{
            Active = $isActive
            PausedTables = $pausedTables
            ActiveSimulations = $activeSimulations
            LastSeen = $lastSeen
        }
    } catch {
        return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
    }
}

# Function to display statistics in a formatted layout
function Show-Statistics {
    $fixStats = Get-FixAttemptsStats
    $pendingInfo = Get-PendingIssuesInfo
    $stats.PendingIssues = $pendingInfo.TotalIssues
    $stats.InFocusMode = $pendingInfo.InFocusMode
    $stats.QueuedIssues = $pendingInfo.QueuedIssuesCount
    
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
    
    # System Components Status
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "SYSTEM COMPONENTS" -ForegroundColor Yellow
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    
    # Log Watcher Status (from recent logs)
    $logWatcherStatus = Get-LogWatcherStatus
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Log Watcher: " -NoNewline -ForegroundColor White
    if ($logWatcherStatus.Active) {
        Write-Host "ACTIVE" -NoNewline -ForegroundColor Green
        if ($logWatcherStatus.PausedTables -gt 0) {
            Write-Host " ($($logWatcherStatus.PausedTables) paused)" -NoNewline -ForegroundColor Yellow
        }
    } else {
        Write-Host "INACTIVE" -NoNewline -ForegroundColor Red
    }
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    # Active Simulations Status
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Simulations: " -NoNewline -ForegroundColor White
    if ($logWatcherStatus.ActiveSimulations -gt 0) {
        Write-Host ("{0:N0} active" -f $logWatcherStatus.ActiveSimulations) -NoNewline -ForegroundColor Cyan
    } else {
        Write-Host "0 active" -NoNewline -ForegroundColor Gray
    }
    Write-Host (" " * 40) -NoNewline
    Write-Host "|" -ForegroundColor Cyan
    
    # Database Status (inferred from server status for now)
    Write-Host "| " -NoNewline -ForegroundColor Cyan
    Write-Host "  Database: " -NoNewline -ForegroundColor White
    if ($stats.ServerStatus -eq "Online") {
        Write-Host "CONNECTED" -NoNewline -ForegroundColor Green
    } else {
        Write-Host "UNKNOWN" -NoNewline -ForegroundColor Gray
    }
    Write-Host (" " * 40) -NoNewline
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
    
    # Focus Mode Status
    if ($pendingInfo.InFocusMode) {
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Mode: " -NoNewline -ForegroundColor White
        Write-Host "FOCUS MODE" -NoNewline -ForegroundColor Yellow
        Write-Host (" " * 50) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
        
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Root Issue: " -NoNewline -ForegroundColor White
        $rootType = $pendingInfo.RootIssue.type
        $rootSeverity = $pendingInfo.RootIssue.severity
        Write-Host "$rootType ($rootSeverity)" -NoNewline -ForegroundColor $(if ($rootSeverity -eq 'critical') { "Red" } else { "Yellow" })
        Write-Host (" " * 40) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
        
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Related Issues: " -NoNewline -ForegroundColor White
        Write-Host ("{0:N0}" -f $pendingInfo.RelatedIssuesCount) -NoNewline -ForegroundColor Cyan
        Write-Host (" " * 40) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
        
        # Show context information if available
        if ($pendingInfo.RootIssue -and $pendingInfo.RootIssue.contextLines) {
            Write-Host "| " -NoNewline -ForegroundColor Cyan
            Write-Host "  Context Lines: " -NoNewline -ForegroundColor White
            Write-Host ("{0:N0}" -f $pendingInfo.RootIssue.contextLines) -NoNewline -ForegroundColor Cyan
            Write-Host (" " * 40) -NoNewline
            Write-Host "|" -ForegroundColor Cyan
        }
        
        if ($pendingInfo.QueuedIssuesCount -gt 0) {
            Write-Host "| " -NoNewline -ForegroundColor Cyan
            Write-Host "  Queued Issues: " -NoNewline -ForegroundColor White
            Write-Host ("{0:N0}" -f $pendingInfo.QueuedIssuesCount) -NoNewline -ForegroundColor Gray
            Write-Host (" " * 40) -NoNewline
            Write-Host "|" -ForegroundColor Cyan
        }
        
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Controls: Ctrl+X = Exit Focus Mode" -ForegroundColor DarkGray
        Write-Host (" " * 30) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
    } else {
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Mode: " -NoNewline -ForegroundColor White
        Write-Host "NORMAL MONITORING" -NoNewline -ForegroundColor Green
        Write-Host (" " * 50) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
        
        Write-Host "| " -NoNewline -ForegroundColor Cyan
        Write-Host "  Pending Issues: " -NoNewline -ForegroundColor White
        if ($pendingInfo.TotalIssues -gt 0) {
            Write-Host ("{0:N0}" -f $pendingInfo.TotalIssues) -NoNewline -ForegroundColor Red
        } else {
            Write-Host "0" -NoNewline -ForegroundColor Green
        }
        Write-Host (" " * 40) -NoNewline
        Write-Host "|" -ForegroundColor Cyan
    }
    
    if ($isPaused -and $currentIssue) {
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

# ============================================================================
# AUTOMATION FUNCTIONS - Service Management
# ============================================================================

# Function to restart database (MySQL) if needed
function Restart-DatabaseIfNeeded {
    if (-not $config.automation.autoRestartDatabase) {
        return $true  # Automation disabled
    }
    
    try {
        # Check if MySQL service is running
        $mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $mysqlService) {
            # Try WAMP/XAMPP service names
            $mysqlService = Get-Service -Name "wampmysqld*", "mysql*" -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        
        if ($mysqlService) {
            if ($mysqlService.Status -ne 'Running') {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] DATABASE: MySQL service not running, attempting restart..." -ForegroundColor "Yellow"
                Start-Service -Name $mysqlService.Name -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                
                # Verify it started
                $mysqlService.Refresh()
                if ($mysqlService.Status -eq 'Running') {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] DATABASE: MySQL service restarted successfully" -ForegroundColor "Green"
                    return $true
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] DATABASE: Failed to restart MySQL service - manual intervention required" -ForegroundColor "Red"
                    return $false
                }
            }
            return $true
        } else {
            # MySQL service not found - might be running via WAMP/XAMPP GUI
            # Check if we can connect to database
            $healthCheck = try {
                $response = Invoke-WebRequest -Uri "$serverUrl/health" -TimeoutSec 2 -ErrorAction Stop
                $health = $response.Content | ConvertFrom-Json
                return $health.database -eq $true
            } catch {
                return $false
            }
            
            if (-not $healthCheck) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] DATABASE: Database appears offline - please restart MySQL manually (WAMP/XAMPP)" -ForegroundColor "Yellow"
                return $false
            }
            return $true
        }
    } catch {
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] DATABASE: Error checking database: $_" -ForegroundColor "Red"
        return $false
    }
}

# Function to restart Unity if needed
function Restart-UnityIfNeeded {
    if (-not $config.automation.autoRestartUnity) {
        return $true  # Automation disabled
    }
    
    if (-not $config.unity.executablePath -or -not (Test-Path $config.unity.executablePath)) {
        return $true  # Unity path not configured
    }
    
    try {
        # Check if Unity is running
        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue
        
        # Check if Unity is connected to server
        $isConnected = $false
        if ($unityProcess) {
            # Check server health for active connections
            try {
                $healthCheck = Invoke-WebRequest -Uri "$serverUrl/health" -TimeoutSec 2 -ErrorAction Stop
                $health = $healthCheck.Content | ConvertFrom-Json
                $isConnected = $health.onlinePlayers -gt 0
            } catch {
                $isConnected = $false
            }
        }
        
        # If Unity is not running or not connected, restart it
        if (-not $unityProcess -or -not $isConnected) {
            if ($unityProcess) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity running but not connected, restarting..." -ForegroundColor "Yellow"
                Stop-Process -Name "Unity" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity not running, starting..." -ForegroundColor "Yellow"
            }
            
            # Start Unity with project path
            $unityArgs = @(
                "-projectPath", $config.unity.projectPath
            )
            
            if ($config.unity.autoConnectOnStartup) {
                # Pass server URL as command line arg (Unity needs to support this)
                $unityArgs += "-serverUrl", $config.unity.serverUrl
            }
            
            Start-Process -FilePath $config.unity.executablePath -ArgumentList $unityArgs -WindowStyle Normal
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity started, waiting for connection..." -ForegroundColor "Cyan"
            
            # Wait up to 60 seconds for Unity to connect
            $maxWait = 60
            $waited = 0
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 3
                $waited += 3
                
                try {
                    $healthCheck = Invoke-WebRequest -Uri "$serverUrl/health" -TimeoutSec 2 -ErrorAction Stop
                    $health = $healthCheck.Content | ConvertFrom-Json
                    if ($health.onlinePlayers -gt 0) {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connected to server!" -ForegroundColor "Green"
                        
                        # If simulation mode, auto-create table and start simulation
                        if ($config.simulation.enabled) {
                            Start-Sleep -Seconds 2  # Give Unity time to fully initialize
                            Start-SimulationTable
                        }
                        
                        return $true
                    }
                } catch {
                    # Server might not be ready yet
                }
            }
            
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity started but not connected after $maxWait seconds" -ForegroundColor "Yellow"
            return $false
        }
        
        return $true
    } catch {
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Error restarting Unity: $_" -ForegroundColor "Red"
        return $false
    }
}

# Function to create and start simulation table (simulation mode only)
function Start-SimulationTable {
    if (-not $config.simulation.enabled) {
        return $false  # Not in simulation mode
    }
    
    try {
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: Creating simulation table..." -ForegroundColor "Cyan"
        
        # TODO: Implement via Socket.IO client or HTTP API
        # For now, this is a placeholder - Unity needs to handle table creation
        # Or we need to add HTTP API endpoint for table creation
        
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: Table creation requires Unity client or HTTP API endpoint" -ForegroundColor "Yellow"
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: TODO: Implement auto-create table functionality" -ForegroundColor "Gray"
        
        return $false
    } catch {
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: Error creating table: $_" -ForegroundColor "Red"
        return $false
    }
}

# Function to check and maintain all services
function Maintain-Services {
    if (-not $config.automation.autoRestartServer -and 
        -not $config.automation.autoRestartDatabase -and 
        -not $config.automation.autoRestartUnity) {
        return  # All automation disabled
    }
    
    # Check and restart services as needed
    if ($config.automation.autoRestartServer) {
        Start-ServerIfNeeded | Out-Null
    }
    
    if ($config.automation.autoRestartDatabase) {
        Restart-DatabaseIfNeeded | Out-Null
    }
    
    if ($config.automation.autoRestartUnity) {
        Restart-UnityIfNeeded | Out-Null
    }
}

# Initialize Windows API for window size control (only once)
if (-not ([System.Management.Automation.PSTypeName]'WindowSizeAPI').Type) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WindowSizeAPI {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public const int SM_CXFRAME = 32;
    public const int SM_CYFRAME = 33;
    public const int SM_CYCAPTION = 4;
    public static IntPtr HWND_TOP = new IntPtr(0);
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_SHOWWINDOW = 0x0040;
}
"@
}

# Function to get actual character size in pixels
function Get-CharacterSize {
    try {
        $hwnd = [WindowSizeAPI]::GetConsoleWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
            $clientRect = New-Object WindowSizeAPI+RECT
            $windowRect = New-Object WindowSizeAPI+RECT
            
            if ([WindowSizeAPI]::GetClientRect($hwnd, [ref]$clientRect) -and 
                [WindowSizeAPI]::GetWindowRect($hwnd, [ref]$windowRect)) {
                $clientWidth = $clientRect.Right - $clientRect.Left
                $clientHeight = $clientRect.Bottom - $clientRect.Top
                $charWidth = [Math]::Round($clientWidth / [Console]::WindowWidth)
                $charHeight = [Math]::Round($clientHeight / [Console]::WindowHeight)
                return @{ Width = $charWidth; Height = $charHeight }
            }
        }
    } catch {}
    # Fallback estimates
    return @{ Width = 8; Height = 16 }
}

# Function to set and enforce minimum window size
function Set-MinimumWindowSize {
    $minWidth = 80   # Minimum width in characters
    $minHeight = 45  # Minimum height in lines (stats ~30 lines + console ~15 lines)
    
    # Store minimum size for checking
    $script:minWindowWidth = $minWidth
    $script:minWindowHeight = $minHeight
    
    try {
        $currentWidth = [Console]::WindowWidth
        $currentHeight = [Console]::WindowHeight
        
        if ($currentWidth -lt $minWidth -or $currentHeight -lt $minHeight) {
            # Try SetWindowSize first (PowerShell 5.1+)
            try {
                [Console]::SetWindowSize($minWidth, $minHeight)
                return
            } catch {}
            
            # Use Windows API to resize
            $hwnd = [WindowSizeAPI]::GetConsoleWindow()
            if ($hwnd -ne [IntPtr]::Zero) {
                $charSize = Get-CharacterSize
                $minPixelWidth = $minWidth * $charSize.Width
                $minPixelHeight = $minHeight * $charSize.Height
                
                # Get current window rect
                $rect = New-Object WindowSizeAPI+RECT
                if ([WindowSizeAPI]::GetWindowRect($hwnd, [ref]$rect)) {
                    $currentPixelWidth = $rect.Right - $rect.Left
                    $currentPixelHeight = $rect.Bottom - $rect.Top
                    
                    # Calculate border sizes
                    $frameX = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CXFRAME)
                    $frameY = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CYFRAME)
                    $caption = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CYCAPTION)
                    
                    # Total window size needed
                    $totalWidth = $minPixelWidth + ($frameX * 2)
                    $totalHeight = $minPixelHeight + ($frameY * 2) + $caption
                    
                    # Resize window
                    [WindowSizeAPI]::SetWindowPos($hwnd, [WindowSizeAPI]::HWND_TOP, 
                        $rect.Left, $rect.Top, $totalWidth, $totalHeight, 
                        [WindowSizeAPI]::SWP_SHOWWINDOW)
                }
            }
        }
    } catch {
        # If setting window size fails, just continue
    }
}

# Function to enforce minimum window size (called periodically)
function Enforce-MinimumWindowSize {
    if (-not $script:minWindowWidth -or -not $script:minWindowHeight) {
        return
    }
    
    try {
        $currentWidth = [Console]::WindowWidth
        $currentHeight = [Console]::WindowHeight
        
        if ($currentWidth -lt $script:minWindowWidth -or $currentHeight -lt $script:minWindowHeight) {
            # Try SetWindowSize first (simpler, more reliable)
            try {
                [Console]::SetWindowSize($script:minWindowWidth, $script:minWindowHeight)
                return
            } catch {}
            
            # Use Windows API
            $hwnd = [WindowSizeAPI]::GetConsoleWindow()
            if ($hwnd -ne [IntPtr]::Zero) {
                $charSize = Get-CharacterSize
                $minPixelWidth = $script:minWindowWidth * $charSize.Width
                $minPixelHeight = $script:minWindowHeight * $charSize.Height
                
                $rect = New-Object WindowSizeAPI+RECT
                if ([WindowSizeAPI]::GetWindowRect($hwnd, [ref]$rect)) {
                    $frameX = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CXFRAME)
                    $frameY = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CYFRAME)
                    $caption = [WindowSizeAPI]::GetSystemMetrics([WindowSizeAPI]::SM_CYCAPTION)
                    
                    $totalWidth = $minPixelWidth + ($frameX * 2)
                    $totalHeight = $minPixelHeight + ($frameY * 2) + $caption
                    
                    [WindowSizeAPI]::SetWindowPos($hwnd, [WindowSizeAPI]::HWND_TOP, 
                        $rect.Left, $rect.Top, $totalWidth, $totalHeight, 
                        [WindowSizeAPI]::SWP_SHOWWINDOW)
                }
            }
        }
    } catch {
        # Ignore errors
    }
}

# Check for and kill any existing monitor processes (ensure only one instance)
function Stop-ExistingMonitorInstances {
    try {
        # Get all PowerShell processes
        $allPowershellProcesses = Get-Process powershell -ErrorAction SilentlyContinue
        
        foreach ($proc in $allPowershellProcesses) {
            try {
                # Check command line to see if it's running monitor.ps1
                $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
                
                if ($cmdLine -and $cmdLine -like "*monitor.ps1*") {
                    # Don't kill ourselves
                    if ($proc.Id -ne $PID) {
                        Write-Info "Found existing monitor process (PID: $($proc.Id)) - stopping it..."
                        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Milliseconds 500
                        Write-Success "Existing monitor process stopped"
                    }
                }
            } catch {
                # Ignore errors checking individual processes
            }
        }
    } catch {
        # If we can't check, just continue
    }
}

# Kill any existing monitor instances before starting
Stop-ExistingMonitorInstances

# Set minimum window size at startup
Set-MinimumWindowSize

# Start server if needed before showing statistics
Start-ServerIfNeeded

# Initial service maintenance check
Maintain-Services

# Initial display
Show-Statistics

# Main monitoring loop
$lastStatsUpdate = Get-Date
$lastServiceCheck = Get-Date
$serviceCheckInterval = 30  # Check services every 30 seconds

while ($monitoringActive) {
    try {
        # Periodic service maintenance (every 30 seconds)
        $timeSinceServiceCheck = (Get-Date) - $lastServiceCheck
        if ($timeSinceServiceCheck.TotalSeconds -ge $serviceCheckInterval) {
            Maintain-Services
            $lastServiceCheck = Get-Date
        }
        
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
                            
                            # Check if this started a new focus group or was added to existing
                            if ($addResult.reason -eq 'new_focus_group') {
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] FOCUS MODE: New issue detected - entering focus mode" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "  Root Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "White"
                                Write-ConsoleOutput -Message "  Group ID: $($addResult.groupId)" -ForegroundColor "Cyan"
                            } elseif ($addResult.reason -eq 'added_to_group') {
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] RELATED ISSUE: Added to focus group" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "  Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "White"
                                Write-ConsoleOutput -Message "  Group ID: $($addResult.groupId)" -ForegroundColor "Cyan"
                            } else {
                                # Regular issue detection
                                $issueMessage = "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTED: $($issue.type) ($($issue.severity))"
                                Write-ConsoleOutput -Message $issueMessage -ForegroundColor "Yellow"
                            }
                            
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
                            # Handle different failure reasons
                            if ($addResult -and $addResult.reason -eq 'queued') {
                                # Issue was queued (unrelated to focused issue)
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE QUEUED: Unrelated to focused issue - will process later" -ForegroundColor "Gray"
                            } elseif ($addResult -and ($addResult.reason -eq 'duplicate' -or $addResult.reason -eq 'duplicate_in_group')) {
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
            $pendingInfo = Get-PendingIssuesInfo
            if ($pendingInfo.TotalIssues -eq 0 -and -not $pendingInfo.InFocusMode) {
                # Issues have been fixed - write resume marker to game.log
                $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
                $resumeMarker = "[$timestamp] [GAME] [MONITOR] [ISSUES_FIXED] All issues fixed - resuming Unity | Data: {`"action`":`"resume`",`"reason`":`"pending-issues.json cleared`"}"
                
                try {
                    Add-Content -Path $logFile -Value $resumeMarker -ErrorAction Stop
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUES FIXED: Resume marker written to game.log" -ForegroundColor "Green"
                    Write-ConsoleOutput -Message "  Waiting for log watcher to resume Unity..." -ForegroundColor "Yellow"
                } catch {
                    Write-ConsoleOutput -Message "  ERROR: Failed to write resume marker: $_" -ForegroundColor "Red"
                }
                
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
        
        # Check for keyboard input (manual exit from focus mode)
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)  # $true = don't display the key
            if ($key.Key -eq 'X' -and $key.Modifiers -eq 'Control') {
                # Ctrl+X to exit focus mode
                $pendingInfo = Get-PendingIssuesInfo
                if ($pendingInfo.InFocusMode) {
                    $result = node $nodeScript --exit-focus 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        $exitResult = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
                        if ($exitResult -and $exitResult.success) {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] FOCUS MODE EXITED (Ctrl+X)" -ForegroundColor "Yellow"
                            if ($exitResult.reason -eq 'exited_and_promoted_next') {
                                Write-ConsoleOutput -Message "  Next queued issue promoted to focus mode" -ForegroundColor "Cyan"
                            } else {
                                Write-ConsoleOutput -Message "  Returning to normal monitoring" -ForegroundColor "Green"
                            }
                            $isPaused = $false
                            $currentIssue = $null
                        }
                    }
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] Not in focus mode - nothing to exit" -ForegroundColor "Gray"
                }
            } elseif ($key.Key -eq 'Escape') {
                # Escape key to show help
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] Monitor Controls: Ctrl+X = Exit Focus Mode" -ForegroundColor "Cyan"
            }
        }
        
        # Enforce minimum window size aggressively (every 0.5 seconds)
        $lastWindowCheck = if ($script:lastWindowCheck) { $script:lastWindowCheck } else { Get-Date }
        if (($now - $lastWindowCheck).TotalSeconds -ge 0.5) {
            Enforce-MinimumWindowSize
            $script:lastWindowCheck = $now
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
