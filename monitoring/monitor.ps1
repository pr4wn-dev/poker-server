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
    [string]$Mode = "simulation"
)

$ErrorActionPreference = "Continue"

# Ensure we're in the correct directory (poker-server root)
# Script is in monitoring/ folder, so go up one level
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:projectRoot = Split-Path -Parent $scriptDir
Set-Location $script:projectRoot

# Colors for output (define FIRST before any use)
function Write-Status { param($message, $color = "White") Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" -ForegroundColor $color }
function Write-Info { param($message) Write-Status $message "Cyan" }
function Write-Success { param($message) Write-Status $message "Green" }
function Write-Warning { param($message) Write-Status $message "Yellow" }
function Write-Error { param($message) Write-Status $message "Red" }

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
$script:lastConsoleError = $null  # Track last console error to avoid spam

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
    LastLogActivity = Get-Date
    PauseMarkersWritten = 0
    PauseMarkerErrors = 0
    UnityRunning = $false
    UnityConnected = $false
    SimulationRunning = $false
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

# Helper function to safely set cursor position (handles invalid console handle errors)
function Set-SafeCursorPosition {
    param(
        [int]$X = 0,
        [int]$Y = 0
    )
    
    try {
        [Console]::SetCursorPosition($X, $Y)
        return $true
    } catch {
        # Console handle may be invalid (window resized/closed) - this is non-fatal
        # Only log error once per minute to avoid spam
        if ($script:lastConsoleError -eq $null -or ((Get-Date) - $script:lastConsoleError).TotalSeconds -gt 60) {
            # Silently continue - don't spam errors
            $script:lastConsoleError = Get-Date
        }
        return $false
    }
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
            if (Set-SafeCursorPosition -X 0 -Y $line) {
                Write-Host (" " * [Console]::WindowWidth) -NoNewline
            }
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
            if (Set-SafeCursorPosition -X 0 -Y $line) {
                Write-Host (" " * [Console]::WindowWidth) -NoNewline
            }
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
    try {
        [Console]::CursorVisible = $false
        if (Set-SafeCursorPosition -X 0 -Y $currentConsoleLine) {
            Write-Host $truncatedMessage -ForegroundColor $ForegroundColor
        } else {
            # If cursor position failed, just write normally
            Write-Host $truncatedMessage -ForegroundColor $ForegroundColor
        }
        
        # Increment line count
        $script:consoleLineCount++
        
        # Track when we wrote console output
        $script:lastConsoleOutputTime = Get-Date
        
        # Return cursor to top for stats (but don't update stats immediately)
        # Restore cursor visibility
        Set-SafeCursorPosition -X 0 -Y 0 | Out-Null
        [Console]::CursorVisible = $true
    } catch {
        # If console operations fail, just write normally
        Write-Host $truncatedMessage -ForegroundColor $ForegroundColor
    }
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

# Function to verify Unity is actually connected and playing (not just that a simulation table exists)
function Get-UnityActualStatus {
    try {
        $status = @{
            ProcessRunning = $false
            ConnectedToServer = $false
            InGameScene = $false
            ReceivingGameUpdates = $false
            LastGameActivity = $null
            LastConnectionActivity = $null
            Status = "UNKNOWN"
            Details = @()
        }
        
        # Check 1: Is Unity process running?
        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue
        $status.ProcessRunning = $null -ne $unityProcess
        if ($status.ProcessRunning) {
            $status.Details += "Process: Running (PID: $($unityProcess.Id))"
        } else {
            $status.Details += "Process: NOT running"
            $status.Status = "STOPPED"
            return $status
        }
        
        # Check 2: Is Unity connected to server?
        try {
            $healthCheck = Invoke-WebRequest -Uri "$serverUrl/health" -TimeoutSec 2 -ErrorAction Stop
            $health = $healthCheck.Content | ConvertFrom-Json
            $status.ConnectedToServer = $health.onlinePlayers -gt 0
            if ($status.ConnectedToServer) {
                $status.Details += "Server Connection: Connected ($($health.onlinePlayers) players online)"
                $status.LastConnectionActivity = Get-Date
            } else {
                $status.Details += "Server Connection: NOT connected (0 players online)"
            }
        } catch {
            $status.ConnectedToServer = $false
            $status.Details += "Server Connection: Health check failed - $($_.Exception.Message)"
        }
        
        # Check 3: Is Unity in a game scene (not MainMenuScene)?
        if (Test-Path $logFile) {
            $recentLines = Get-Content $logFile -Tail 500 -ErrorAction SilentlyContinue
            $now = Get-Date
            $gameActivityFound = $false
            $connectionActivityFound = $false
            
            foreach ($line in $recentLines) {
                # Extract timestamp
                $lineTime = $null
                if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                    try {
                        $lineTime = [DateTime]::Parse($matches[1])
                    } catch {
                        $lineTime = $null
                    }
                }
                
                if ($lineTime) {
                    $timeDiff = ($now - $lineTime).TotalSeconds
                    
                    # Check for Unity client activity (within last 2 minutes)
                    # EXCLUDE server-side entries - only look for actual Unity client events
                    if ($timeDiff -le 120 -and $line -notmatch '\[LOG_WATCHER\]|\[MONITOR\]|\[STATUS_REPORT\]|\[TRACE\]|\[GAME\].*\[TRACE\]') {
                        # Unity is in game if we see actual Unity client events:
                        # - CLIENT_CONNECTED (Unity connecting to server)
                        # - REPORT_UNITY_LOG (Unity sending logs)
                        # - join_table from actual client (not bot)
                        # - action events from Unity client
                        # - login events
                        if ($line -match '\[SYSTEM\].*\[SOCKET\].*CLIENT_CONNECTED|REPORT_UNITY_LOG|\[UNITY\]|join_table.*success|action.*from.*client|login.*success|Unity.*connected|client.*connected.*socket') {
                            $gameActivityFound = $true
                            if (-not $status.LastGameActivity -or $lineTime -gt $status.LastGameActivity) {
                                $status.LastGameActivity = $lineTime
                            }
                        }
                        
                        # Check for Unity connection events (within last 2 minutes)
                        # Look for actual Unity client connection events
                        if ($line -match '\[SYSTEM\].*\[SOCKET\].*CLIENT_CONNECTED|Unity.*connected|client.*connected.*socket|login.*success') {
                            $connectionActivityFound = $true
                            if (-not $status.LastConnectionActivity -or $lineTime -gt $status.LastConnectionActivity) {
                                $status.LastConnectionActivity = $lineTime
                            }
                        }
                    }
                }
            }
            
            $status.InGameScene = $gameActivityFound
            $status.ReceivingGameUpdates = $gameActivityFound
            
            if ($gameActivityFound) {
                $status.Details += "Game Activity: Active (last seen: $($status.LastGameActivity.ToString('HH:mm:ss')))"
            } else {
                $status.Details += "Game Activity: NONE (Unity may be in MainMenuScene or idle)"
            }
            
            if ($connectionActivityFound) {
                $status.Details += "Connection Activity: Recent (last seen: $($status.LastConnectionActivity.ToString('HH:mm:ss')))"
            } else {
                $status.Details += "Connection Activity: NONE (no recent connection events)"
            }
        }
        
        # Determine overall status
        if (-not $status.ProcessRunning) {
            $status.Status = "STOPPED"
        } elseif (-not $status.ConnectedToServer) {
            $status.Status = "IDLE"
            $status.Details += "⚠️  Unity process running but NOT connected to server"
        } elseif (-not $status.InGameScene) {
            $status.Status = "IDLE"
            $status.Details += "⚠️  Unity connected but NOT in game scene (likely in MainMenuScene)"
        } elseif ($status.ReceivingGameUpdates) {
            $status.Status = "ACTIVE"
            $status.Details += "✅ Unity is connected and actively playing"
        } else {
            $status.Status = "CONNECTED"
            $status.Details += "⚠️  Unity connected but no recent game activity"
        }
        
        return $status
    } catch {
        return @{
            ProcessRunning = $false
            ConnectedToServer = $false
            InGameScene = $false
            ReceivingGameUpdates = $false
            Status = "ERROR"
            Details = @("Error checking Unity status: $($_.Exception.Message)")
        }
    }
}

# Function to get Log Watcher status from recent logs
function Get-LogWatcherStatus {
    try {
        if (-not (Test-Path $logFile)) {
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        
        # Read last 1000 lines to find recent activity (increased to catch simulations that start after a delay)
        $recentLines = Get-Content $logFile -Tail 1000 -ErrorAction SilentlyContinue
        if (-not $recentLines) {
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        
        $isActive = $false
        $pausedTables = 0
        $activeSimulations = 0
        $lastSeen = $null
        $now = Get-Date
        
        # Look for simulation indicators in multiple log types (not just LOG_WATCHER)
        foreach ($line in $recentLines) {
            # Extract timestamp if present
            $lineTime = $null
            if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                try {
                    $lineTime = [DateTime]::Parse($matches[1])
                } catch {
                    $lineTime = $null
                }
            }
            
            # Check if line is recent (within last 60 seconds for simulation detection)
            $isRecent = $false
            if ($lineTime) {
                $timeDiff = ($now - $lineTime).TotalSeconds
                $isRecent = $timeDiff -le 60  # Check last 60 seconds for simulations
            } else {
                # If no timestamp, assume recent if it's in the tail
                $isRecent = $true
            }
            
            if (-not $isRecent) {
                continue
            }
            
            # Check LOG_WATCHER entries
            if ($line -match '\[LOG_WATCHER\]') {
                if ($lineTime) {
                    $timeDiff = ($now - $lineTime).TotalSeconds
                    if ($timeDiff -le 10) {
                        $isActive = $true
                        if (-not $lastSeen -or $lineTime -gt $lastSeen) {
                            $lastSeen = $lineTime
                        }
                    }
                } else {
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
            
            # Check STATUS_REPORT entries for simulation info
            if ($line -match '\[STATUS_REPORT\]') {
                if ($line -match '"activeSimulations":(\d+)' -or $line -match '"activeSimulationsCount":(\d+)') {
                    $simCount = [int]$matches[1]
                    if ($simCount -gt 0) {
                        $activeSimulations = [Math]::Max($activeSimulations, $simCount)
                    }
                }
            }
            
            # Check for explicit simulation start/activity indicators
            if ($line -match '\[SIM\]|SIMULATION_STARTED|SIMULATION_ACTIVE|simulation.*start|table.*simulation.*created') {
                if ($lineTime) {
                    $timeDiff = ($now - $lineTime).TotalSeconds
                    if ($timeDiff -le 30) {  # Simulation activity within last 30 seconds
                        $activeSimulations = [Math]::Max($activeSimulations, 1)
                    }
                } else {
                    $activeSimulations = [Math]::Max($activeSimulations, 1)
                }
            }
            
            # Check for simulation completion (10/10 games)
            if ($line -match 'Game\s+10\s*/\s*10|10\s*/\s*10\s+games|simulation.*complete|maxGames.*reached|handsPlayed.*10') {
                if ($lineTime) {
                    $timeDiff = ($now - $lineTime).TotalSeconds
                    if ($timeDiff -le 10) {  # Just completed (within last 10 seconds)
                        $activeSimulations = 0
                    }
                } else {
                    $activeSimulations = 0
                }
            }
            
            # Check for simulation end indicators
            if ($line -match 'SIMULATION_ENDED|SIMULATION_STOPPED|TABLE_DESTROYED.*simulation') {
                if ($lineTime) {
                    $timeDiff = ($now - $lineTime).TotalSeconds
                    if ($timeDiff -le 5) {  # Just ended (within last 5 seconds)
                        $activeSimulations = 0
                    }
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
    
    # Get Unity actual status (verify it's really connected and playing, not just that a simulation table exists)
    $unityActualStatus = Get-UnityActualStatus
    $unityStatus = $unityActualStatus.Status
    $unityColor = switch ($unityStatus) {
        "ACTIVE" { "Green" }
        "CONNECTED" { "Cyan" }
        "IDLE" { "Yellow" }
        "STOPPED" { "Red" }
        default { "Gray" }
    }
    
    # Update stats from actual status (so main loop sees the same state)
    $stats.UnityRunning = $unityActualStatus.ProcessRunning
    $stats.UnityConnected = $unityActualStatus.ConnectedToServer
    $simStatus = if ($stats.SimulationRunning) { "ACTIVE" } else { "STOPPED" }
    $simColor = if ($stats.SimulationRunning) { "Green" } else { "Red" }
    $logWatcherStatus = Get-LogWatcherStatus
    # Calculate time since last activity (with null check)
    if ($stats.LastLogActivity -and $stats.LastLogActivity -is [DateTime]) {
        $timeSinceActivity = (Get-Date) - $stats.LastLogActivity
        $activityText = "$([math]::Round($timeSinceActivity.TotalSeconds))s ago"
        $activityColor = if ($timeSinceActivity.TotalSeconds -lt 60) { "Green" } elseif ($timeSinceActivity.TotalSeconds -lt 120) { "Yellow" } else { "Red" }
    } else {
        $activityText = "N/A"
        $activityColor = "Gray"
    }
    
    # Only clear screen on first display, then update in place
    if ($script:firstDisplay -eq $null) {
        Clear-Host
        $script:firstDisplay = $true
    } else {
        try {
            [Console]::CursorVisible = $false
            Set-SafeCursorPosition -X 0 -Y 0 | Out-Null
            Start-Sleep -Milliseconds 10
        } catch {
            # Console handle may be invalid (window resized/closed) - just continue
            # This is handled by Set-SafeCursorPosition, but catch any other errors
        }
    }
    
    # Get console width for dynamic layout
    $consoleWidth = [Console]::WindowWidth
    if ($consoleWidth -lt 120) { $consoleWidth = 120 }
    $colWidth = [Math]::Floor(($consoleWidth - 6) / 3)  # 3 columns with separators
    
    # Header
    $headerText = "AUTOMATED ISSUE MONITORING SYSTEM - LIVE STATISTICS"
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    $headerPadding = [Math]::Max(0, [Math]::Floor(($consoleWidth - $headerText.Length) / 2))
    Write-Host (" " * $headerPadding + $headerText) -ForegroundColor White
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    
    # Top status bar - single row across full width
    $statusText = if ($isPaused) { "PAUSED" } else { "ACTIVE" }
    $statusColor = if ($isPaused) { "Red" } else { "Green" }
    $serverStatusText = if ($stats.ServerStatus -eq "Online") { "ONLINE" } else { "OFFLINE" }
    $serverStatusColor = if ($stats.ServerStatus -eq "Online") { "Green" } else { "Red" }
    
    Write-Host ""
    Write-Host "STATUS: " -NoNewline -ForegroundColor White
    Write-Host $statusText -NoNewline -ForegroundColor $statusColor
    Write-Host " | " -NoNewline -ForegroundColor DarkGray
    Write-Host "UPTIME: " -NoNewline -ForegroundColor White
    Write-Host $uptimeStr -NoNewline -ForegroundColor Yellow
    Write-Host " | " -NoNewline -ForegroundColor DarkGray
    Write-Host "SERVER: " -NoNewline -ForegroundColor White
    Write-Host $serverStatusText -NoNewline -ForegroundColor $serverStatusColor
    Write-Host " | " -NoNewline -ForegroundColor DarkGray
    Write-Host "UNITY: " -NoNewline -ForegroundColor White
    Write-Host $unityStatus -NoNewline -ForegroundColor $unityColor
    Write-Host " | " -NoNewline -ForegroundColor DarkGray
    Write-Host "SIM: " -NoNewline -ForegroundColor White
    Write-Host $simStatus -NoNewline -ForegroundColor $simColor
    Write-Host " | " -NoNewline -ForegroundColor DarkGray
    Write-Host "ACTIVITY: " -NoNewline -ForegroundColor White
    Write-Host $activityText -NoNewline -ForegroundColor $activityColor
    Write-Host ""
    Write-Host ("-" * $consoleWidth) -ForegroundColor DarkGray
    
    # Build three columns of data
    $col1Lines = @()
    $col2Lines = @()
    $col3Lines = @()
    
    # Column 1: System Status & Automation
    $col1Lines += "SYSTEM STATUS"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Log Watcher: " + $(if($logWatcherStatus.Active){"ACTIVE"}else{"INACTIVE"})
    if ($logWatcherStatus.PausedTables -gt 0) {
        $col1Lines += "  Paused: " + $logWatcherStatus.PausedTables
    }
    $col1Lines += "Simulations: " + $logWatcherStatus.ActiveSimulations
    $col1Lines += "Database: " + $(if($stats.ServerStatus -eq "Online"){"CONNECTED"}else{"UNKNOWN"})
    $col1Lines += ""
    $col1Lines += "AUTOMATION"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Mode: " + $config.mode.ToUpper()
    $col1Lines += "Auto-Restart Server: " + $(if($config.automation.autoRestartServer){"ENABLED"}else{"DISABLED"})
    $col1Lines += "Auto-Restart Unity: " + $(if($config.automation.autoRestartUnity){"ENABLED"}else{"DISABLED"})
    $col1Lines += "Auto-Restart DB: " + $(if($config.automation.autoRestartDatabase){"ENABLED"}else{"DISABLED"})
    
    # Column 2: Detection & Issues
    $col2Lines += "DETECTION STATS"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "Lines: " + ("{0:N0}" -f $stats.TotalLinesProcessed)
    $col2Lines += "Issues: " + ("{0:N0}" -f $stats.IssuesDetected)
    $col2Lines += "Patterns: " + $stats.UniquePatterns.Count
    $col2Lines += "Log Size: " + ("{0:N2} MB" -f $stats.LogFileSize)
    if ($stats.LastIssueTime) {
        $col2Lines += "Last Issue: " + $stats.LastIssueTime.ToString("HH:mm:ss")
    }
    $col2Lines += "Pause Markers: " + $stats.PauseMarkersWritten
    $col2Lines += ""
    $col2Lines += "ISSUES BY SEVERITY"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "Critical: " + ("{0:N0}" -f $stats.IssuesBySeverity.critical)
    $col2Lines += "High:     " + ("{0:N0}" -f $stats.IssuesBySeverity.high)
    $col2Lines += "Medium:   " + ("{0:N0}" -f $stats.IssuesBySeverity.medium)
    $col2Lines += "Low:      " + ("{0:N0}" -f $stats.IssuesBySeverity.low)
    
    # Column 3: Issues by Source, Fixes, Pending
    $col3Lines += "ISSUES BY SOURCE"
    $col3Lines += ("-" * ($colWidth - 2))
    $col3Lines += "Server:   " + ("{0:N0}" -f $stats.IssuesBySource.server)
    $col3Lines += "Unity:    " + ("{0:N0}" -f $stats.IssuesBySource.unity)
    $col3Lines += "Database: " + ("{0:N0}" -f $stats.IssuesBySource.database)
    $col3Lines += "Network:  " + ("{0:N0}" -f $stats.IssuesBySource.network)
    $col3Lines += ""
    $col3Lines += "FIX ATTEMPTS"
    $col3Lines += ("-" * ($colWidth - 2))
    $col3Lines += "Total: " + ("{0:N0}" -f $fixStats.Total)
    $col3Lines += "Success: " + ("{0:N0}" -f $fixStats.Successes)
    $col3Lines += "Failed: " + ("{0:N0}" -f $fixStats.Failures)
    $col3Lines += "Rate: " + ("{0:N1}%" -f $fixStats.SuccessRate)
    $col3Lines += ""
    $col3Lines += "PENDING ISSUES"
    $col3Lines += ("-" * ($colWidth - 2))
    if ($pendingInfo.InFocusMode) {
        $col3Lines += "Mode: FOCUS MODE"
        if ($pendingInfo.RootIssue) {
            $col3Lines += "Root: " + $pendingInfo.RootIssue.type
            $col3Lines += "Related: " + $pendingInfo.RelatedIssuesCount
            $col3Lines += "Queued: " + $pendingInfo.QueuedIssuesCount
        }
    } else {
        $col3Lines += "Mode: NORMAL"
        $col3Lines += "Pending: " + $pendingInfo.TotalIssues
    }
    
    # Display columns side by side
    $maxLines = [Math]::Max($col1Lines.Count, [Math]::Max($col2Lines.Count, $col3Lines.Count))
    for ($i = 0; $i -lt $maxLines; $i++) {
        $line1 = if ($i -lt $col1Lines.Count) { $col1Lines[$i] } else { "" }
        $line2 = if ($i -lt $col2Lines.Count) { $col2Lines[$i] } else { "" }
        $line3 = if ($i -lt $col3Lines.Count) { $col3Lines[$i] } else { "" }
        
        # Determine colors
        $c1 = if ($line1 -match "ACTIVE|ENABLED|CONNECTED") { "Green" } elseif ($line1 -match "INACTIVE|DISABLED|STOPPED|UNKNOWN") { "Red" } elseif ($line1 -match "SYSTEM|AUTOMATION") { "Yellow" } else { "White" }
        $c2 = if ($line2 -match "Issues: [1-9]|Critical: [1-9]|High: [1-9]") { "Red" } elseif ($line2 -match "DETECTION|ISSUES BY SEVERITY") { "Yellow" } else { "White" }
        $c3 = if ($line3 -match "Failed: [1-9]") { "Red" } elseif ($line3 -match "Success: [1-9]") { "Green" } elseif ($line3 -match "FOCUS MODE") { "Cyan" } elseif ($line3 -match "ISSUES BY SOURCE|FIX ATTEMPTS|PENDING ISSUES") { "Yellow" } else { "White" }
        
        Write-Host ($line1.PadRight($colWidth)) -NoNewline -ForegroundColor $c1
        Write-Host " | " -NoNewline -ForegroundColor DarkGray
        Write-Host ($line2.PadRight($colWidth)) -NoNewline -ForegroundColor $c2
        Write-Host " | " -NoNewline -ForegroundColor DarkGray
        Write-Host ($line3.PadRight($colWidth)) -NoNewline -ForegroundColor $c3
        Write-Host ""
    }
    
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    
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
        if (Set-SafeCursorPosition -X 0 -Y $line) {
            Write-Host (" " * [Console]::WindowWidth) -NoNewline
        }
    }
    
    # Move cursor back to top (line 0) for next update - this keeps stats visible
    Set-SafeCursorPosition -X 0 -Y 0 | Out-Null
    
    # Restore cursor visibility
    [Console]::CursorVisible = $true
}

# Function to start server if not running
function Start-ServerIfNeeded {
    if (-not (Test-ServerRunning)) {
        # Don't write to console - update stats display instead
        # Write-Warning "Server is not running. Starting server..."
        try {
            # Step 0: Stop all active simulations before killing server (if server is running)
            try {
                $stopResponse = Invoke-WebRequest -Uri "$serverUrl/api/simulations/stop-all" -Method POST -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                $stopResult = $stopResponse.Content | ConvertFrom-Json
                if ($stopResult.success -and $stopResult.stopped -gt 0) {
                    # Don't write to console - update stats display instead
                    # Write-Info "Stopped $($stopResult.stopped) active simulation(s) before restart"
                }
            } catch {
                # Server might not be running - that's okay
            }
            
            # Kill processes using port 3000 first (more reliable than just killing node processes)
            $port3000Processes = @()
            try {
                $netstatOutput = netstat -ano | Select-String ":3000"
                foreach ($line in $netstatOutput) {
                    if ($line -match '\s+(\d+)\s*$') {
                        $processId = [int]$matches[1]
                        try {
                            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                            if ($process) {
                                $port3000Processes += $process
                            }
                        } catch {
                            # Process might have already terminated
                        }
                    }
                }
            } catch {
                # If netstat fails, fall back to killing all node processes
            }
            
            # Also kill any node processes (in case they're not on port 3000 yet)
            $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
            
            # Combine both lists (remove duplicates by PID)
            $allProcessesToKill = @{}
            foreach ($proc in $port3000Processes) {
                $allProcessesToKill[$proc.Id] = $proc
            }
            foreach ($proc in $nodeProcesses) {
                $allProcessesToKill[$proc.Id] = $proc
            }
            
            if ($allProcessesToKill.Count -gt 0) {
                foreach ($proc in $allProcessesToKill.Values) {
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                }
                Start-Sleep -Seconds 2
            }
            
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
        $wasUnityRunning = $stats.UnityRunning
        $isUnityRunning = $null -ne $unityProcess
        
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
        
        # Log Unity startup when process first appears
        if ($isUnityRunning -and -not $wasUnityRunning) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎮 UNITY: Game process started (PID: $($unityProcess.Id))" -ForegroundColor "Green"
        }
        
        # Log Unity connection when it first connects
        if ($isConnected -and -not $stats.UnityConnected) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎮 UNITY: Connected to server!" -ForegroundColor "Green"
        }
        
        # Update stats
        $stats.UnityRunning = $isUnityRunning
        $stats.UnityConnected = $isConnected
        
        # If Unity is not running or not connected, restart it
        if (-not $unityProcess -or -not $isConnected) {
            if ($unityProcess) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity running but not connected, restarting..." -ForegroundColor "Yellow"
                Stop-Process -Name "Unity" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity not running, starting..." -ForegroundColor "Yellow"
            }
            
            # Start Unity with project path and auto-mode
            $unityArgs = @(
                "-projectPath", $config.unity.projectPath
            )
            
            # Pass auto-mode to Unity (simulation or normal)
            if ($config.simulation.enabled) {
                $unityArgs += "-autoMode", "simulation"
            } else {
                $unityArgs += "-autoMode", "normal"
            }
            
            # Pass server URL for auto-connect
            if ($config.unity.autoConnectOnStartup) {
                $unityArgs += "-serverUrl", $config.unity.serverUrl
            }
            
            # Pass login credentials for auto-login
            if ($config.automation.autoLogin -and $config.login.username) {
                $unityArgs += "-autoLogin", $config.login.username
                if ($config.login.password) {
                    $unityArgs += "-autoPassword", $config.login.password
                }
            }
            
            # Start Unity in normal window (visible, not headless) so user can see everything
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

# Note: Table creation and simulation start are handled by Unity itself
# Unity receives -autoMode command-line arg and handles:
# - Auto-connect to server
# - Auto-login
# - Auto-create table (simulation mode only)
# - Auto-start simulation (simulation mode only)
# Monitor just restarts Unity with the right args - Unity does the rest

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

# Always restart server on startup (kill existing node processes and start fresh)
Write-Info "Restarting server on monitor startup..."
try {
    # Step 0: Stop all active simulations before killing server (if server is running)
    Write-Info "Stopping all active simulations..."
    try {
        $stopResponse = Invoke-WebRequest -Uri "$serverUrl/api/simulations/stop-all" -Method POST -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        $stopResult = $stopResponse.Content | ConvertFrom-Json
        if ($stopResult.success) {
            Write-Success "Stopped $($stopResult.stopped) active simulation(s)"
            if ($stopResult.failed -gt 0) {
                Write-Warning "Failed to stop $($stopResult.failed) simulation(s)"
            }
        }
    } catch {
        # Server might not be running or endpoint might not exist yet - that's okay
        Write-Info "Could not stop simulations (server may not be running): $_"
    }
    
    # Step 1: Find and kill processes using port 3000
    Write-Info "Checking for processes using port 3000..."
    $port3000Processes = @()
    try {
        # Use netstat to find processes using port 3000
        $netstatOutput = netstat -ano | Select-String ":3000"
        foreach ($line in $netstatOutput) {
            if ($line -match '\s+(\d+)\s*$') {
                $processId = [int]$matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process) {
                        $port3000Processes += $process
                    }
                } catch {
                    # Process might have already terminated
                }
            }
        }
    } catch {
        Write-Warning "Could not check port 3000: $_"
    }
    
    # Step 2: Kill all node processes
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    
    # Combine both lists (remove duplicates by PID)
    $allProcessesToKill = @{}
    foreach ($proc in $port3000Processes) {
        $allProcessesToKill[$proc.Id] = $proc
    }
    foreach ($proc in $nodeProcesses) {
        $allProcessesToKill[$proc.Id] = $proc
    }
    
    if ($allProcessesToKill.Count -gt 0) {
        Write-Info "Killing $($allProcessesToKill.Count) process(es) (node processes and/or processes using port 3000)..."
        foreach ($proc in $allProcessesToKill.Values) {
            try {
                Write-Info "  Killing process: $($proc.ProcessName) (PID: $($proc.Id))"
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
            } catch {
                Write-Warning "  Failed to kill process $($proc.Id): $_"
            }
        }
        
        # Wait for processes to fully terminate
        Start-Sleep -Seconds 3
        
        # Verify port 3000 is free
        $portStillInUse = $true
        $maxPortCheckWait = 10
        $portCheckWaited = 0
        while ($portStillInUse -and $portCheckWaited -lt $maxPortCheckWait) {
            try {
                $netstatOutput = netstat -ano | Select-String ":3000"
                if (-not $netstatOutput) {
                    $portStillInUse = $false
                    Write-Success "Port 3000 is now free"
                } else {
                    Start-Sleep -Seconds 1
                    $portCheckWaited += 1
                }
            } catch {
                # If we can't check, assume it's free
                $portStillInUse = $false
            }
        }
        
        if ($portStillInUse) {
            Write-Warning "Port 3000 may still be in use after killing processes"
        }
    } else {
        Write-Info "No node processes or processes using port 3000 found"
    }
    
    # Step 3: Start server in background
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
            break
        }
    }
    
    if (-not (Test-ServerRunning)) {
        Write-Warning "Server failed to start within $maxWait seconds"
    }
} catch {
    Write-Error "Failed to restart server: $_"
}

# Initial service maintenance check
Maintain-Services

# Initial display
Show-Statistics

# Main monitoring loop
$lastStatsUpdate = Get-Date
$lastServiceCheck = Get-Date
$lastUnityCheck = Get-Date
$lastServerCheck = Get-Date
$lastUnityWarning = Get-Date
$serviceCheckInterval = 30  # Check services every 30 seconds
$script:simulationEndTime = $null  # Track when simulation ended for idle detection

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
                $stats.LastLogActivity = Get-Date  # Update last activity timestamp
                
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
                        # Explain why we're pausing
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🔴 PAUSING: $($issue.severity.ToUpper()) severity issue detected" -ForegroundColor "Red"
                        # Issue detected - pause Unity and log issue
                        # Don't write to console - update stats display instead
                        # Write-Error "ISSUE DETECTED: $($issue.message.Substring(0, [Math]::Min(100, $issue.message.Length)))"
                        # Write-Error "  Type: $($issue.type), Severity: $($issue.severity), Source: $($issue.source)"
                        
                        # Extract table ID if available
                        $tableId = $null
                        # Try multiple patterns to extract table ID (avoid PowerShell parsing issues with character classes)
                        # Pattern 1: tableId: "uuid" or tableId": "uuid"
                        if ($line -match 'tableId.*?"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"') {
                            $tableId = $matches[1]
                        }
                        # Pattern 2: tableId: uuid (no quotes)
                        elseif ($line -match 'tableId.*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})') {
                            $tableId = $matches[1]
                        }
                        # Pattern 3: Any quoted value after tableId
                        elseif ($line -match 'tableId.*?"([^"]+)"') {
                            $tableId = $matches[1]
                        }
                        # Pattern 4: Any word characters after tableId (fallback)
                        elseif ($line -match 'tableId.*?(\w{8,})') {
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
                                Write-ConsoleOutput -Message "  ✅ Pause marker written to game.log" -ForegroundColor "Green"
                                Write-ConsoleOutput -Message "  ⏳ Waiting for log watcher to pause Unity..." -ForegroundColor "Yellow"
                                
                                # Verify pause actually happened (check logs after 2 seconds)
                                Start-Sleep -Seconds 2
                                $pauseVerified = Verify-UnityPaused -TableId $tableId -TimeoutSeconds 5
                                
                                if ($pauseVerified.Success) {
                                    Write-ConsoleOutput -Message "  ✅ VERIFIED: Unity paused successfully" -ForegroundColor "Green"
                                    if ($pauseVerified.Details) {
                                        Write-ConsoleOutput -Message "    Details: $($pauseVerified.Details)" -ForegroundColor "Gray"
                                    }
                                } else {
                                    Write-ConsoleOutput -Message "  ⚠️  WARNING: Unity pause NOT verified!" -ForegroundColor "Red"
                                    Write-ConsoleOutput -Message "    Reason: $($pauseVerified.Reason)" -ForegroundColor "Yellow"
                                    Write-ConsoleOutput -Message "    Diagnostics:" -ForegroundColor "Yellow"
                                    
                                    # Run diagnostics
                                    $diagnostics = Get-PauseDiagnostics -TableId $tableId
                                    foreach ($diag in $diagnostics) {
                                        $color = if ($diag.Status -eq "OK") { "Green" } elseif ($diag.Status -eq "WARNING") { "Yellow" } else { "Red" }
                                        Write-ConsoleOutput -Message "      - $($diag.Check): $($diag.Status) - $($diag.Message)" -ForegroundColor $color
                                    }
                                }
                            } catch {
                                # If writing fails, log it but continue
                                $stats.PauseMarkerErrors++
                                Write-ConsoleOutput -Message "  ❌ ERROR: Failed to write pause marker: $_" -ForegroundColor "Red"
                                Write-ConsoleOutput -Message "    Check: Log file permissions, disk space, file locks" -ForegroundColor "Yellow"
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
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ❌ FAILED TO LOG ISSUE: $errorMsg" -ForegroundColor "Red"
                                Write-ConsoleOutput -Message "  Issue detected but NOT logged to pending-issues.json" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "  Diagnostics:" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "    - Check if issue-detector.js is working: node monitoring/issue-detector.js --test" -ForegroundColor "Gray"
                                Write-ConsoleOutput -Message "    - Check if pending-issues.json is writable" -ForegroundColor "Gray"
                                Write-ConsoleOutput -Message "    - Check Node.js error output for details" -ForegroundColor "Gray"
                            }
                        }
                    } else {
                        # Issue detected but not pausing (medium/low severity or already paused)
                        if ($issue.severity -eq 'medium' -or $issue.severity -eq 'low') {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  ISSUE (NOT PAUSING): $($issue.type) ($($issue.severity)) - Only critical/high severity issues pause Unity" -ForegroundColor "Gray"
                        } elseif ($isPaused) {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  ISSUE (ALREADY PAUSED): $($issue.type) ($($issue.severity)) - Unity already paused, issue queued" -ForegroundColor "Gray"
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
        
        # Check Unity actual status continuously (every 5 seconds) and restart if needed
        $now = Get-Date
        $unityCheckInterval = 5  # Check Unity every 5 seconds
        $timeSinceUnityCheck = $now - $lastUnityCheck
        if ($timeSinceUnityCheck.TotalSeconds -ge $unityCheckInterval) {
            $unityActualStatus = Get-UnityActualStatus
            $wasUnityRunning = $stats.UnityRunning
            $wasUnityConnected = $stats.UnityConnected
            $wasUnityActive = ($stats.UnityRunning -and $stats.UnityConnected)
            
            # Update stats from actual status
            $stats.UnityRunning = $unityActualStatus.ProcessRunning
            $stats.UnityConnected = $unityActualStatus.ConnectedToServer
            
            # Log status changes
            if ($unityActualStatus.ProcessRunning -and -not $wasUnityRunning) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎮 UNITY: Process detected" -ForegroundColor "Green"
            }
            
            if ($unityActualStatus.ConnectedToServer -and -not $wasUnityConnected) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎮 UNITY: Connected to server!" -ForegroundColor "Green"
            }
            
            # Warn if Unity is not actually playing (connected but idle)
            if ($unityActualStatus.ProcessRunning -and $unityActualStatus.ConnectedToServer -and -not $unityActualStatus.InGameScene) {
                if (-not $wasUnityActive -or ($now - $lastUnityWarning).TotalSeconds -gt 60) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  UNITY: Connected but NOT in game scene (likely in MainMenuScene)" -ForegroundColor "Yellow"
                    Write-ConsoleOutput -Message "  Details: $($unityActualStatus.Details -join '; ')" -ForegroundColor "Gray"
                    $lastUnityWarning = $now
                }
            }
            
            # If Unity is not running, not connected, or not actively playing (in simulation mode), restart it
            if ($config.automation.autoRestartUnity) {
                $shouldRestart = $false
                $restartReason = ""
                
                if (-not $unityActualStatus.ProcessRunning) {
                    $shouldRestart = $true
                    $restartReason = "Unity process not running"
                } elseif (-not $unityActualStatus.ConnectedToServer) {
                    $shouldRestart = $true
                    $restartReason = "Unity not connected to server"
                } elseif ($config.simulation.enabled -and -not $unityActualStatus.InGameScene) {
                    # In simulation mode, if Unity is idle (not in game scene), restart it
                    $shouldRestart = $true
                    $restartReason = "Unity connected but not in game scene (simulation mode requires active gameplay)"
                }
                
                if ($shouldRestart) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🔄 UNITY: Restarting - $restartReason" -ForegroundColor "Cyan"
                    Restart-UnityIfNeeded | Out-Null
                }
            }
            
            $lastUnityCheck = $now
        }
        
        # Check simulation status from logs (every 5 seconds)
        $logWatcherStatus = Get-LogWatcherStatus
        $wasSimulationRunning = $stats.SimulationRunning
        
        # Also check logs directly for simulation completion (10/10 games)
        $simulationCompleted = $false
        if (Test-Path $logFile) {
            $recentLogs = Get-Content $logFile -Tail 200 -ErrorAction SilentlyContinue
            foreach ($line in $recentLogs) {
                # Check for simulation completion indicators
                if ($line -match 'Reached max games|maxGames.*reached|Game\s+10\s*/\s*10|10\s*/\s*10\s+games|simulation.*complete|stopping simulation') {
                    # Check timestamp - only if within last 30 seconds
                    if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                        try {
                            $lineTime = [DateTime]::Parse($matches[1])
                            $timeDiff = ((Get-Date) - $lineTime).TotalSeconds
                            if ($timeDiff -le 30) {
                                $simulationCompleted = $true
                                break
                            }
                        } catch {
                            # If timestamp parsing fails, assume recent
                            $simulationCompleted = $true
                            break
                        }
                    } else {
                        # No timestamp but matches pattern - assume recent
                        $simulationCompleted = $true
                        break
                    }
                }
            }
        }
        
        # If simulation completed, mark as stopped
        if ($simulationCompleted) {
            $stats.SimulationRunning = $false
            $logWatcherStatus.ActiveSimulations = 0
        } else {
            # Only consider simulation "ACTIVE" if:
            # 1. Server reports active simulations, AND
            # 2. Unity is actually connected and in a game scene (receiving game updates)
            # If there's a simulation on the server but Unity isn't connected to it, treat it as inactive
            $serverHasSimulation = $logWatcherStatus.ActiveSimulations -gt 0
            $unityActualStatus = Get-UnityActualStatus
            $unityIsInGame = $unityActualStatus.InGameScene -and $unityActualStatus.ReceivingGameUpdates
            
            if ($serverHasSimulation -and $unityIsInGame) {
                # Both server and Unity agree: simulation is active
                $stats.SimulationRunning = $true
            } elseif ($serverHasSimulation -and -not $unityIsInGame) {
                # Server has simulation but Unity isn't connected to it - treat as inactive
                # This means there's an orphaned simulation (bots playing without Unity)
                $stats.SimulationRunning = $false
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  SIMULATION: Server has active simulation but Unity is NOT connected to it (orphaned simulation)" -ForegroundColor "Yellow"
                
                # Stop orphaned simulations immediately
                try {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🛑 Stopping orphaned simulation(s)..." -ForegroundColor "Cyan"
                    $stopResponse = Invoke-WebRequest -Uri "$serverUrl/api/simulations/stop-all" -Method POST -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                    $stopResult = $stopResponse.Content | ConvertFrom-Json
                    if ($stopResult.success) {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ✅ Stopped $($stopResult.stopped) orphaned simulation(s)" -ForegroundColor "Green"
                        if ($stopResult.failed -gt 0) {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  Failed to stop $($stopResult.failed) simulation(s)" -ForegroundColor "Yellow"
                        }
                    }
                } catch {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ❌ Failed to stop orphaned simulations: $_" -ForegroundColor "Red"
                }
            } else {
                # No simulation on server
                $stats.SimulationRunning = $false
            }
        }
        
        # Log simulation start/stop
        if ($stats.SimulationRunning -and -not $wasSimulationRunning) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎲 SIMULATION: Started ($($logWatcherStatus.ActiveSimulations) active)" -ForegroundColor "Green"
        } elseif (-not $stats.SimulationRunning -and $wasSimulationRunning) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🎲 SIMULATION: Completed (10/10 games) - Unity is now idle" -ForegroundColor "Yellow"
            
            # In simulation mode, if simulation ended and Unity is running but idle, restart it to start a new simulation
            if ($config.simulation.enabled -and $config.automation.autoRestartUnity -and $stats.UnityRunning) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🔄 UNITY: Simulation completed - restarting Unity to start new simulation..." -ForegroundColor "Cyan"
                $restartResult = Restart-UnityIfNeeded
                if ($restartResult) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ✅ UNITY: Restarted - waiting for new simulation to start..." -ForegroundColor "Green"
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ❌ UNITY: Failed to restart after simulation completed" -ForegroundColor "Red"
                }
            } elseif ($config.simulation.enabled -and -not $stats.UnityRunning) {
                # Unity not running after simulation ended - restart it
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🔄 UNITY: Simulation completed and Unity not running - restarting..." -ForegroundColor "Cyan"
                Restart-UnityIfNeeded | Out-Null
            } elseif ($config.simulation.enabled) {
                # Simulation ended but Unity restart is disabled or Unity is not running
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  UNITY: Simulation completed but Unity restart disabled or Unity not running" -ForegroundColor "Yellow"
            }
        }
        
        # In simulation mode, check if Unity is idle (running but no active simulation Unity is connected to)
        # This includes:
        # 1. No simulation on server at all
        # 2. Server has simulation but Unity isn't connected to it (orphaned simulation)
        if ($config.simulation.enabled -and $stats.UnityRunning -and -not $stats.SimulationRunning) {
            if (-not $script:simulationEndTime) {
                $script:simulationEndTime = Get-Date
            }
            $timeSinceSimEnd = (Get-Date) - $script:simulationEndTime
            if ($timeSinceSimEnd.TotalSeconds -gt 30) {
                $reason = if ($logWatcherStatus.ActiveSimulations -gt 0) {
                    "orphaned simulation (server has simulation but Unity not connected)"
                } else {
                    "no active simulation"
                }
                
                # If there's an orphaned simulation, stop it before restarting Unity
                if ($logWatcherStatus.ActiveSimulations -gt 0) {
                    try {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] 🛑 Stopping orphaned simulation before restarting Unity..." -ForegroundColor "Cyan"
                        $stopResponse = Invoke-WebRequest -Uri "$serverUrl/api/simulations/stop-all" -Method POST -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                        $stopResult = $stopResponse.Content | ConvertFrom-Json
                        if ($stopResult.success -and $stopResult.stopped -gt 0) {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ✅ Stopped $($stopResult.stopped) orphaned simulation(s)" -ForegroundColor "Green"
                        }
                    } catch {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  Could not stop orphaned simulation: $_" -ForegroundColor "Yellow"
                    }
                }
                
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  UNITY: Idle for $([math]::Round($timeSinceSimEnd.TotalSeconds))s - $reason - restarting..." -ForegroundColor "Yellow"
                $script:simulationEndTime = $null  # Reset timer
                Restart-UnityIfNeeded | Out-Null
            }
        } else {
            # Reset timer if simulation is running (Unity is connected) or Unity is not running
            $script:simulationEndTime = $null
        }
        
        # Check server status continuously and restart if needed (every 5 seconds)
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
