# Automated Issue Monitoring System
# Monitors logs continuously, detects issues, pauses Unity, and waits for fixes
# Displays real-time statistics in a formatted layout
#
# Usage: 
#   .\monitoring\BrokenPromise.ps1                    # Normal mode (default)
#   .\monitoring\BrokenPromise.ps1 -Mode simulation   # Simulation mode (fully automated)
#   .\monitoring\BrokenPromise.ps1 -Mode normal       # Normal mode (user creates table)
#
# Modes:
#   - simulation: Fully automated including table creation and simulation start
#   - normal: User creates table manually, everything else automated

param(
    [ValidateSet("simulation", "normal")]
    [string]$Mode = "simulation",
    [switch]$SkipBootstrap = $false
)

$ErrorActionPreference = "Continue"

# Ensure we're in the correct directory (poker-server root)
# Script is in monitoring/ folder, so go up one level
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:projectRoot = Split-Path -Parent $scriptDir
Set-Location $script:projectRoot

# Bootstrap check - Run BEFORE anything else (after setting directories)
# Check syntax directly in this process so we can actually stop execution
if (-not $SkipBootstrap) {
    Write-Host "[BROKENPROMISE] Running syntax check..." -ForegroundColor Cyan
    
    $brokenPromisePath = Join-Path $scriptDir "brokenpromise.ps1"
    if (Test-Path $brokenPromisePath) {
        try {
            $errors = $null
            $tokens = $null
            $content = Get-Content $brokenPromisePath -Raw
            
            # Parse the script - this will catch syntax errors
            $null = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)
            
            if ($errors -and $errors.Count -gt 0) {
                Write-Host ""
                Write-Host "[BROKENPROMISE] SYNTAX ERRORS DETECTED - Cannot start" -ForegroundColor Red
                foreach ($err in $errors) {
                    Write-Host "  Line $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Red
                }
                Write-Host ""
                Write-Host "[BROKENPROMISE] BrokenPromise has syntax errors and cannot start" -ForegroundColor Red
                Write-Host "[BROKENPROMISE] Check logs\prompts-for-user.txt for prompt to give to AI" -ForegroundColor Yellow
                Write-Host "[BROKENPROMISE] Or run with -SkipBootstrap to bypass (not recommended)" -ForegroundColor Yellow
                Write-Host ""
                
                # Write prompt to file
                $promptFile = Join-Path $script:projectRoot "logs\prompts-for-user.txt"
                $promptText = "BrokenPromise has PowerShell syntax errors:`r`n"
                foreach ($err in $errors) {
                    $promptText += "Line $($err.Extent.StartLineNumber): $($err.Message)`r`n"
                }
                $promptText += "`r`nFix these syntax errors before BrokenPromise can start.`r`n"
                try {
                    $promptText | Out-File -FilePath $promptFile -Encoding UTF8 -Append
                } catch {
                    # Ignore file write errors
                }
                
                # ACTUALLY EXIT - this runs in the same process so it will work
                exit 1
            }
            
            Write-Host "[BROKENPROMISE] Syntax check passed" -ForegroundColor Green
        } catch {
            Write-Host "[BROKENPROMISE] Syntax check failed: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}

# Function to check if we're in an interactive console
function Test-InteractiveConsole {
    try {
        # Check if we have a valid console handle
        $null = [Console]::WindowWidth
        $null = [Console]::WindowHeight
        # Check if output is redirected (non-interactive)
        if ([Environment]::UserInteractive -and $Host.UI.RawUI) {
            return $true
        }
        return $false
    } catch {
        # Console handle invalid - not interactive
        return $false
    }
}

# Colors for output (define FIRST before any use)
function Write-Status { param($message, $color = "White") Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" -ForegroundColor $color }
function Write-Info { param($message) Write-Status $message "Cyan" }
function Write-Success { param($message) Write-Status $message "Green" }
function Write-Warning { param($message) Write-Status $message "Yellow" }
function Write-Error { param($message) Write-Status $message "Red" }

# Source BrokenPromise Integration helpers (NEW: AI-first monitoring system)
$aiIntegrationPath = Join-Path $scriptDir "BrokenPromiseIntegration.ps1"
if (Test-Path $aiIntegrationPath) {
    . $aiIntegrationPath
    Write-Info "AI Integration loaded - AI-first monitoring system active"
    $script:aiIntegrationEnabled = $true
} else {
    Write-Warning "AI Integration not found at $aiIntegrationPath - using legacy system"
    $script:aiIntegrationEnabled = $false
}

# Source Show-BrokenPromiseStatistics function (AI-powered display)
$showStatsPath = Join-Path $scriptDir "Show-BrokenPromiseStatistics.ps1"
if (Test-Path $showStatsPath) {
    . $showStatsPath
    Write-Info "AI Statistics Display loaded"
} else {
    Write-Warning "Show-BrokenPromiseStatistics.ps1 not found at $showStatsPath - display may not work correctly"
}

# Configuration - use absolute paths to prevent directory issues
$logFile = Join-Path $script:projectRoot "logs\game.log"
$pendingIssuesFile = Join-Path $script:projectRoot "logs\pending-issues.json"
$fixAppliedFile = Join-Path $script:projectRoot "logs\fix-applied.json"
$monitorStatusFile = Join-Path $script:projectRoot "logs\monitor-status.json"  # Persistent status file for AI assistant
$checkInterval = 1  # Check every 1 second
# Legacy issue-detector.js removed - AI system now handles all issue detection
$serverUrl = "http://localhost:3000"
$statsUpdateInterval = 5  # Update stats display every 5 seconds (more responsive)
$configFile = Join-Path $script:projectRoot "monitoring\BrokenPromise-config.json"

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
        itemAnteEnabled = $false  # Default to false, can be overridden in config file
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
        if ($fileConfig.investigation) { $config.investigation = $fileConfig.investigation }
        
        # Override mode from command line if provided
        if ($Mode -ne "normal") {
            $config.mode = $Mode
            $config.simulation.enabled = ($Mode -eq "simulation")
        }
        
        Write-Info "Loaded configuration from $configFile"
        
        # Debug: Log itemAnteEnabled value if simulation is enabled
        if ($config.simulation -and $config.simulation.enabled) {
            $itemAnteValue = "not set"
            $itemAnteType = "null"
            if ($config.simulation.PSObject.Properties['itemAnteEnabled']) {
                $itemAnteValue = $config.simulation.itemAnteEnabled
                $itemAnteType = $itemAnteValue.GetType().Name
            }
            Write-Info "  Simulation config - itemAnteEnabled: $itemAnteValue (type: $itemAnteType)"
        }
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
$script:isInvestigating = $false  # Track if we're in investigation phase
$script:investigationStartTime = $null  # When investigation started
$investigationTimeout = if ($config.investigation -and $config.investigation.timeoutSeconds) { $config.investigation.timeoutSeconds } else { 15 }  # Seconds to investigate before pausing
$investigationEnabled = if ($config.investigation -and $config.investigation.enabled -ne $false) { $true } else { $false }
$isVerifyingFix = $false  # Track if we're verifying a fix
$verificationStartTime = $null  # When verification started
$verificationPeriod = 0  # Total verification period in seconds
$verificationIssuePattern = $null  # Pattern to match during verification (type, source, tableId)
$currentIssue = $null
$monitoringActive = $true
$lastServerCheck = Get-Date  # Track last server health check
$previousStats = @{}  # Track previous stats values to only update when changed
$script:consoleOutputStartLine = 0  # Will be set by Show-Statistics
$script:maxConsoleLines = 15  # Maximum number of console output lines to keep visible
$script:consoleLineCount = 0  # Track how many console lines we've written
$script:lastConsoleError = $null  # Track last console error to avoid spam

# Caching for non-blocking operations
$script:unityStatusCache = $null  # Cached Unity status
$script:unityStatusCacheTime = $null  # When Unity status was last cached
$script:unityStatusCacheInterval = 5  # Cache Unity status for 5 seconds
$script:activeJobs = @{}  # Track active PowerShell jobs to prevent job leaks

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

# ============================================================================
# NON-BLOCKING HELPER FUNCTIONS
# ============================================================================

# Helper function for non-blocking web requests using jobs
function Invoke-WebRequestAsync {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [string]$Body = $null,
        [string]$ContentType = "application/json",
        [int]$TimeoutSec = 5,
        [int]$JobTimeout = 8
    )
    
    try {
        $jobId = "webrequest_$(Get-Date -Format 'yyyyMMddHHmmss')_$(Get-Random)"
        $scriptBlock = {
            param($url, $method, $body, $contentType, $timeout)
            try {
                $params = @{
                    Uri = $url
                    Method = $method
                    UseBasicParsing = $true
                    TimeoutSec = $timeout
                    ErrorAction = "Stop"
                }
                if ($body) {
                    $params.Body = $body
                    $params.ContentType = $contentType
                }
                $response = Invoke-WebRequest @params
                return @{
                    Success = $true
                    StatusCode = $response.StatusCode
                    Content = $response.Content
                }
            } catch {
                return @{
                    Success = $false
                    Error = $_.Exception.Message
                    StatusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { $null }
                }
            }
        }
        
        $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $Uri, $Method, $Body, $ContentType, $TimeoutSec
        if (-not $script:activeJobs) { $script:activeJobs = @{} }
        $script:activeJobs[$jobId] = $job
        
        # Wait for job with timeout
        $result = $job | Wait-Job -Timeout $JobTimeout | Receive-Job
        $job | Remove-Job -ErrorAction SilentlyContinue
        if ($script:activeJobs.ContainsKey($jobId)) {
            $script:activeJobs.Remove($jobId)
        }
        
        return $result
    } catch {
        # Clean up job if it exists
        if ($script:activeJobs -and $script:activeJobs.ContainsKey($jobId)) {
            $script:activeJobs[$jobId] | Remove-Job -Force -ErrorAction SilentlyContinue
            $script:activeJobs.Remove($jobId)
        }
        return @{ Success = $false; Error = $_.Exception.Message }
    }
}

# Helper function for non-blocking Node.js calls using jobs
function Invoke-NodeAsync {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments = @(),
        [int]$JobTimeout = 10
    )
    
    try {
        $jobId = "node_$(Get-Date -Format 'yyyyMMddHHmmss')_$(Get-Random)"
        $scriptBlock = {
            param($scriptPath, $args)
            try {
                $result = & node $scriptPath @args 2>&1 | Out-String
                return @{
                    Success = $true
                    ExitCode = $LASTEXITCODE
                    Output = $result
                }
            } catch {
                return @{
                    Success = $false
                    ExitCode = -1
                    Error = $_.Exception.Message
                    Output = $null
                }
            }
        }
        
        $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $ScriptPath, $Arguments
        if (-not $script:activeJobs) { $script:activeJobs = @{} }
        $script:activeJobs[$jobId] = $job
        
        # Wait for job with timeout
        $result = $job | Wait-Job -Timeout $JobTimeout | Receive-Job
        $job | Remove-Job -ErrorAction SilentlyContinue
        if ($script:activeJobs.ContainsKey($jobId)) {
            $script:activeJobs.Remove($jobId)
        }
        
        return $result
    } catch {
        # Clean up job if it exists
        if ($script:activeJobs -and $script:activeJobs.ContainsKey($jobId)) {
            $script:activeJobs[$jobId] | Remove-Job -Force -ErrorAction SilentlyContinue
            $script:activeJobs.Remove($jobId)
        }
        return @{ Success = $false; ExitCode = -1; Error = $_.Exception.Message; Output = $null }
    }
}

# Function to pause Unity using /api/simulation/pause (non-blocking, more reliable)
function Invoke-PauseUnity {
    param(
        [string]$tableId = $null,
        [string]$reason = "Monitor detected critical issue"
    )
    
    try {
        # First, get the table from server (non-blocking)
        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
        if (-not $healthResult.Success) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to get server health for Unity pause: $($healthResult.Error)" -ForegroundColor "Yellow"
            return $false
        }
        
        $serverHealth = $healthResult.Content | ConvertFrom-Json
        if ($serverHealth.activeSimulations -eq 0) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: No active simulations to pause" -ForegroundColor "Yellow"
            return $false
        }
        
        # Get tables (non-blocking)
        $tablesResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/tables" -TimeoutSec 2 -JobTimeout 3
        if (-not $tablesResult.Success) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to get tables for Unity pause: $($tablesResult.Error)" -ForegroundColor "Yellow"
            return $false
        }
        
        $tables = $tablesResult.Content | ConvertFrom-Json
        $targetTable = $tables | Where-Object { $_.id -eq $tableId -or ($null -eq $tableId -and $_.isSimulation -eq $true) } | Select-Object -First 1
        
        if (-not $targetTable) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Could not find target simulation table to pause" -ForegroundColor "Yellow"
            return $false
        }
        
        # Call the server API to pause the simulation table (non-blocking)
        $pauseBody = @{
            tableId = $targetTable.id
            reason = $reason
        } | ConvertTo-Json
        
        $pauseResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulation/pause" -Method POST -Body $pauseBody -ContentType "application/json" -TimeoutSec 5 -JobTimeout 6
        
        if ($pauseResult.Success) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Paused via table state update for table $($targetTable.id)" -ForegroundColor "Green"
            return $true
        } else {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to pause Unity via API: $($pauseResult.Error)" -ForegroundColor "Yellow"
            return $false
        }
    } catch {
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ERROR: Failed to pause Unity: $_" -ForegroundColor "Red"
        return $false
    }
}

# Function to call Node.js issue detector (non-blocking) - LEGACY, use AI system instead
function Invoke-IssueDetector {
    param($logLine)
    
    # Use AI system if available, otherwise return null (legacy fallback removed)
    if ($script:aiIntegrationEnabled) {
        try {
            $aiDetected = Detect-AIIssue -LogLine $logLine
            if ($aiDetected -and $aiDetected.Issue) {
                return $aiDetected.Issue
            }
        } catch {
            # AI detection failed - return null
        }
    }
    return $null
}

# Function to write to log file with proper file sharing (handles file locks)
function Write-ToLogFile {
    param(
        [string]$FilePath,
        [string]$Content
    )
    
    $maxRetries = 5
    $retryDelay = 200  # milliseconds
    
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            # Use FileStream with ReadWrite sharing to allow concurrent access
            $fileStream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
            $writer = New-Object System.IO.StreamWriter($fileStream)
            $writer.WriteLine($Content)
            $writer.Close()
            $fileStream.Close()
            return $true
        } catch {
            if ($attempt -lt $maxRetries) {
                Start-Sleep -Milliseconds $retryDelay
                $retryDelay = $retryDelay * 2  # Exponential backoff
            } else {
                throw "Failed to write to log file after $maxRetries attempts: $_"
            }
        }
    }
    return $false
}

# Function to add issue via Node.js
function Add-PendingIssue {
    param($issueData)
    
    try {
        # Convert to JSON and write to temp file to avoid PowerShell/Node.js argument parsing issues
        # First, ensure all string values are properly sanitized
        $sanitizedData = @{
            message = $issueData.message
            source = $issueData.source
            severity = $issueData.severity
            type = $issueData.type
            tableId = $issueData.tableId
        }
        
        $jsonData = $sanitizedData | ConvertTo-Json -Compress -Depth 10
        if (-not $jsonData -or $jsonData.Length -eq 0) {
            Write-Warning "Failed to convert issue data to JSON"
            return $null
        }
        
        # Verify JSON is valid by trying to parse it
        try {
            $testParse = $jsonData | ConvertFrom-Json -ErrorAction Stop
        } catch {
            Write-Warning "Generated JSON is invalid: $_"
            return $null
        }
        
        $tempFile = Join-Path $env:TEMP "monitor-issue-$(Get-Date -Format 'yyyyMMddHHmmss')-$(Get-Random).json"
        
        # Write JSON without BOM (UTF8NoBOM) and ensure no trailing newlines
        [System.IO.File]::WriteAllText($tempFile, $jsonData, [System.Text.UTF8Encoding]::new($false))
        
        # Small delay to ensure file is fully written
        Start-Sleep -Milliseconds 100
        
        # Verify file was written correctly
        if (-not (Test-Path $tempFile)) {
            Write-Warning "Temp file was not created: $tempFile"
            return $null
        }
        
        $fileContent = [System.IO.File]::ReadAllText($tempFile, [System.Text.UTF8Encoding]::new($false))
        if ([string]::IsNullOrWhiteSpace($fileContent)) {
            Write-Warning "Temp file is empty: $tempFile"
            return $null
        }
        
        # Verify the file content is valid JSON before calling Node.js
        try {
            $verifyParse = $fileContent | ConvertFrom-Json -ErrorAction Stop
        } catch {
            Write-Warning "Temp file contains invalid JSON: $_ | Content: $($fileContent.Substring(0, [Math]::Min(200, $fileContent.Length)))"
            # Don't delete the temp file so we can inspect it
            return $null
        }
        
        # Use AI system if available, otherwise fallback to legacy
        if ($script:aiIntegrationEnabled) {
            try {
                $addResult = Add-AIIssueFromFile -FilePath $tempFile
                if ($addResult -and $addResult.success) {
                    # Clean up temp file
                    try {
                        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    } catch {
                        # Ignore cleanup errors
                    }
                    return $addResult
                } else {
                    $errorMsg = if ($addResult -and $addResult.error) { $addResult.error } else { "AI issue detection failed" }
                    Write-Warning "Failed to add issue via AI system: $errorMsg"
                }
            } catch {
                Write-Warning "AI issue detection error: $_"
            }
        }
        
        # Legacy issue-detector.js removed - AI system required
        # Automatic retry logic for issue detector
        $maxRetries = 3
        $retryCount = 0
        $lastError = $null
        
        try {
            while ($retryCount -lt $maxRetries) {
            try {
                # Use non-blocking async call
                $nodeResult = Invoke-NodeAsync -ScriptPath $nodeScript -Arguments @("--add-issue-file", $tempFile) -JobTimeout 5
                $result = if ($nodeResult.Output) { $nodeResult.Output } else { $null }
        if ($nodeResult.Success -and $nodeResult.ExitCode -eq 0 -and $result) {
                    # Remove any non-JSON output (like warnings or errors)
                    $jsonLines = $result -split "`n" | Where-Object { $_ -match '^\s*\{' -or $_ -match '^\s*\[' }
                    $cleanResult = $jsonLines -join "`n"
                    
                    if ($cleanResult) {
                        $jsonResult = $cleanResult | ConvertFrom-Json -ErrorAction SilentlyContinue
                        if ($jsonResult -and $jsonResult.success) {
                            # Success - return result
            return $jsonResult
                        } elseif ($jsonResult -and -not $jsonResult.success) {
                            # JSON error response - check if retryable
                            $lastError = $jsonResult
                            if ($jsonResult.reason -eq "file_locked" -or $jsonResult.reason -eq "json_parse_error") {
                                # Retryable error
                                $retryCount++
                                if ($retryCount -lt $maxRetries) {
                                    Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): $($jsonResult.error)" -ForegroundColor "Yellow"
                                    Start-Sleep -Milliseconds 500
                                    continue
                                }
                            } else {
                                # Non-retryable error
                                break
                            }
                        }
                    }
                }
                
                # If we get here, something failed
                $errorDetails = if ($nodeResult.Error) { $nodeResult.Error } elseif ($result) { $result } else { "Node.js script returned no output (exit code: $($nodeResult.ExitCode))" }
                
                # Try to parse error from result if it's JSON
                try {
                    $errorJson = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($errorJson) {
                        $lastError = $errorJson
                        $errorMsg = $errorJson.error
                        if ($errorJson.contentLength) {
                            $errorMsg += " (length: $($errorJson.contentLength))"
                        }
                        if ($errorJson.firstChars) {
                            $errorMsg += " | First chars: $($errorJson.firstChars)"
                        }
                        if ($errorJson.reason) {
                            $errorMsg += " | Reason: $($errorJson.reason)"
                        }
                        
                        # Check if retryable
                        if ($errorJson.reason -eq "file_locked" -or $errorJson.reason -eq "json_parse_error") {
                            $retryCount++
                            if ($retryCount -lt $maxRetries) {
                                Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): $errorMsg" -ForegroundColor "Yellow"
                                Start-Sleep -Milliseconds 500
                                continue
                            }
                        }
                        
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTOR ERROR: $errorMsg" -ForegroundColor "Red"
                        return @{ success = $false; error = $errorJson.error; reason = $errorJson.reason }
                    }
                } catch {
                    # Not JSON, try retry
                    $retryCount++
                    if ($retryCount -lt $maxRetries) {
                        Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): Parse error, retrying..." -ForegroundColor "Yellow"
                        Start-Sleep -Milliseconds 500
                        continue
                    }
                }
                
                # Final failure after retries
                if ($retryCount -ge $maxRetries) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTOR FAILED after $maxRetries attempts: $errorDetails" -ForegroundColor "Red"
                    Write-ConsoleOutput -Message "  Monitor will continue - issue may be logged on next attempt" -ForegroundColor "Yellow"
                    Update-MonitorStatus -statusUpdate @{
                        issueDetectorStatus = "failed"
                        lastIssueDetectorError = $errorDetails
                        lastIssueDetectorErrorTime = (Get-Date).ToUniversalTime().ToString("o")
                    }
                } else {
                    $retryCount++
                    if ($retryCount -lt $maxRetries) {
                        Start-Sleep -Milliseconds 500
                        continue
                    }
                }
                break
            } catch {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): Exception - $($_.Exception.Message)" -ForegroundColor "Yellow"
                    Start-Sleep -Milliseconds 500
                    continue
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTOR EXCEPTION after $maxRetries attempts: $_" -ForegroundColor "Red"
                    Update-MonitorStatus -statusUpdate @{
                        issueDetectorStatus = "exception"
                        lastIssueDetectorError = $_.Exception.Message
                        lastIssueDetectorErrorTime = (Get-Date).ToUniversalTime().ToString("o")
                    }
                    break
                }
            }
            }
        } catch {
            Write-Warning "Add-PendingIssue legacy try error: $_"
        }
    } catch {
        Write-Warning "Add-PendingIssue outer try error: $_"
    } finally {
        # Clean up temp file
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        }
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
                    RelatedIssues = if ($content.focusedGroup.relatedIssues) { $content.focusedGroup.relatedIssues } else { @() }
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

# Function to read fix-applied.json
function Get-FixAppliedInfo {
    if (Test-Path $fixAppliedFile) {
        try {
            $content = Get-Content $fixAppliedFile -Raw | ConvertFrom-Json
            # Validate required fields
            if (-not $content.groupId) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: fix-applied.json missing groupId - ignoring" -ForegroundColor "Yellow"
                return $null
            }
            if (-not $content.fixDescription) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: fix-applied.json missing fixDescription - ignoring" -ForegroundColor "Yellow"
                return $null
            }
            return $content
        } catch {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to parse fix-applied.json: $_ - cleaning up" -ForegroundColor "Yellow"
            # Clean up corrupted file
            Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
            return $null
        }
    }
    return $null
}

# Function to calculate verification period based on issue severity, restarts, and type
function Calculate-VerificationPeriod {
    param(
        [string]$severity,
        [array]$requiredRestarts,
        [string]$issueType
    )
    
    # Base time by severity
    $baseTime = switch ($severity) {
        "critical" { 90 }
        "high" { 60 }
        "medium" { 45 }
        default { 30 }
    }
    
    # Add time for each restart (15 seconds per restart)
    $restartTime = $requiredRestarts.Count * 15
    
    # Add time for game logic issues (wait for hand/game cycle)
    $gameLogicTime = 0
    if ($issueType -match "pot|chips|bet|award|calculation") {
        $gameLogicTime = 30
    }
    
    # Add time for network issues (wait for reconnection)
    $networkTime = 0
    if ($issueType -match "connection|network|socket|websocket") {
        $networkTime = 20
    }
    
    $total = $baseTime + $restartTime + $gameLogicTime + $networkTime
    return $total
}

# Function to check if services are ready (for verification) - non-blocking
function Test-ServicesReady {
    param(
        [array]$requiredRestarts
    )
    
    $allReady = $true
    $notReady = @()
    
    # Check server (non-blocking)
    if ($requiredRestarts -contains "server" -or $requiredRestarts.Count -eq 0) {
        try {
            $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
            if (-not $healthResult.Success -or $healthResult.StatusCode -ne 200) {
                $allReady = $false
                $notReady += "server"
            }
        } catch {
            $allReady = $false
            $notReady += "server"
        }
    }
    
    # Check database (non-blocking)
    if ($requiredRestarts -contains "database") {
        try {
            $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
            if ($healthResult.Success) {
                $health = $healthResult.Content | ConvertFrom-Json
                if ($health.database -ne $true) {
                    $allReady = $false
                    $notReady += "database"
                }
            } else {
                $allReady = $false
                $notReady += "database"
            }
        } catch {
            $allReady = $false
            $notReady += "database"
        }
    }
    
    # Check Unity (non-blocking)
    if ($requiredRestarts -contains "unity") {
        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue
        if (-not $unityProcess) {
            $allReady = $false
            $notReady += "unity"
        } else {
            # Check if Unity is connected (non-blocking)
            try {
                $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                if ($healthResult.Success) {
                    $health = $healthResult.Content | ConvertFrom-Json
                    if ($health.onlinePlayers -eq 0) {
                        $allReady = $false
                        $notReady += "unity (not connected)"
                    }
                } else {
                    $allReady = $false
                    $notReady += "unity (connection check failed)"
                }
            } catch {
                $allReady = $false
                $notReady += "unity (connection check failed)"
            }
        }
    }
    
    return @{
        AllReady = $allReady
        NotReady = $notReady
    }
}

# Function to check if an issue matches the verification pattern (exact match)
function Test-IssueMatchesVerificationPattern {
    param(
        $issue,
        $verificationPattern
    )
    
    if (-not $verificationPattern) {
        return $false
    }
    
    # Must match type, source, and tableId (if specified)
    $typeMatch = $issue.type -eq $verificationPattern.type
    $sourceMatch = $issue.source -eq $verificationPattern.source
    
    $tableIdMatch = $true
    if ($verificationPattern.tableId) {
        $issueTableId = $null
        if ($issue.tableId) {
            $issueTableId = $issue.tableId
        } elseif ($issue.message -match 'tableId.*?"([^"]+)"') {
            $issueTableId = $matches[1]
        }
        $tableIdMatch = $issueTableId -eq $verificationPattern.tableId
    }
    
    return ($typeMatch -and $sourceMatch -and $tableIdMatch)
}

# Helper function to safely set cursor position (handles invalid console handle errors)
function Set-SafeCursorPosition {
    param(
        [int]$X = 0,
        [int]$Y = 0
    )
    
    # Skip if not in interactive console
    if (-not (Test-InteractiveConsole)) {
        return $false
    }
    
    try {
        [Console]::SetCursorPosition($X, $Y)
        return $true
    } catch {
        # Console handle may be invalid (window resized/closed) - this is non-fatal
        # Silently continue - don't spam errors
        return $false
    }
}

# Function to write console output without causing scrolling
function Write-ConsoleOutput {
    param(
        [string]$Message,
        [string]$ForegroundColor = "White"
    )
    
    # CRITICAL: Always write diagnostic messages to a log file so AI can read them
    # BUT DON'T SHOW THEM IN CONSOLE - user doesn't want to see them
    if ($Message -match "\[DIAGNOSTIC\]|\[SELF-DIAGNOSTIC\]") {
        $diagnosticLogFile = Join-Path $script:projectRoot "logs\monitor-diagnostics.log"
        try {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            "$timestamp $Message" | Out-File -FilePath $diagnosticLogFile -Append -Encoding UTF8 -ErrorAction SilentlyContinue
        } catch {
            # Ignore log write errors
        }
        # DON'T display diagnostic messages in console - only log to file
        return
    }
    
    # If console output area hasn't been initialized, skip
    if ($script:consoleOutputStartLine -eq 0) {
        return
    }
    
    # Check if we've exceeded max console lines - if so, clear and reset
    # Only if we have an interactive console
    if ((Test-InteractiveConsole) -and $script:consoleLineCount -ge $script:maxConsoleLines) {
        # Clear the console output area
        try {
            $windowHeight = [Console]::WindowHeight
            $startClearLine = $script:consoleOutputStartLine
            $endClearLine = [Math]::Min($windowHeight - 1, $script:consoleOutputStartLine + $script:maxConsoleLines)
        } catch {
            # Console handle invalid - skip clearing
            return
        }
        
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
    
    # Make sure we don't go past window height (only if interactive console)
    if (Test-InteractiveConsole) {
        try {
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
        } catch {
            # Console handle invalid - skip window height check
        }
    }
    
    # Truncate message to window width to prevent wrapping (leave 2 chars margin)
    # Only if we have an interactive console
    $truncatedMessage = $Message
    if (Test-InteractiveConsole) {
        try {
            $maxMessageLength = [Console]::WindowWidth - 2
            $truncatedMessage = if ($Message.Length -gt $maxMessageLength) {
                $Message.Substring(0, $maxMessageLength - 3) + "..."
            } else {
                $Message
            }
        } catch {
            # Console handle invalid - use message as-is
            $truncatedMessage = $Message
        }
    }
    
    # Write the message (hide cursor during write to prevent flicker)
    # Only do console operations if we have an interactive console
    if (Test-InteractiveConsole) {
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
            $script:consoleLineCount++
            $script:lastConsoleOutputTime = Get-Date
        }
    } else {
        # Not interactive - just write normally
        Write-Host $truncatedMessage -ForegroundColor $ForegroundColor
        $script:consoleLineCount++
        $script:lastConsoleOutputTime = Get-Date
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

# Function to check if server is running (non-blocking)
function Test-ServerRunning {
    try {
        # Try health endpoint with longer timeout (non-blocking)
        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 5 -JobTimeout 6
        if ($healthResult.Success) {
            return $true
        }
        # If health check fails, also try root endpoint as fallback (non-blocking)
        $rootResult = Invoke-WebRequestAsync -Uri "$serverUrl/" -TimeoutSec 3 -JobTimeout 4
        return $rootResult.Success
    } catch {
        return $false
    }
}

# Function to update persistent monitor status file (for AI assistant to read)
function Update-MonitorStatus {
    param(
        [hashtable]$statusUpdate = @{}
    )
    
    try {
        # Safely get variable values (handle case where they might not exist yet)
        $statsStartTime = if ($stats -and $stats.StartTime) { 
            if ($stats.StartTime -is [DateTime]) { $stats.StartTime } else { Get-Date }
        } else { 
            Get-Date 
        }
        $statsServerStatus = if ($stats -and $stats.ServerStatus) { $stats.ServerStatus } else { "Unknown" }
        $statsUnityRunning = if ($stats -and $stats.UnityRunning) { $stats.UnityRunning } else { $false }
        $statsUnityConnected = if ($stats -and $stats.UnityConnected) { $stats.UnityConnected } else { $false }
        $statsPendingIssues = if ($stats -and $stats.PendingIssues) { $stats.PendingIssues } else { 0 }
        $statsInFocusMode = if ($stats -and $stats.InFocusMode) { $stats.InFocusMode } else { $false }
        $statsQueuedIssues = if ($stats -and $stats.QueuedIssues) { $stats.QueuedIssues } else { 0 }
        $statsTotalLinesProcessed = if ($stats -and $stats.TotalLinesProcessed) { $stats.TotalLinesProcessed } else { 0 }
        $statsIssuesDetected = if ($stats -and $stats.IssuesDetected) { $stats.IssuesDetected } else { 0 }
        $statsLastIssueTime = if ($stats -and $stats.LastIssueTime) { $stats.LastIssueTime } else { $null }
        $statsPauseMarkersWritten = if ($stats -and $stats.PauseMarkersWritten) { $stats.PauseMarkersWritten } else { 0 }
        $statsPauseMarkerErrors = if ($stats -and $stats.PauseMarkerErrors) { $stats.PauseMarkerErrors } else { 0 }
        
        $unityActualStatus = try { (Get-UnityActualStatus).Status } catch { "Unknown" }
        $isInvestigatingValue = if (Get-Variable -Name "isInvestigating" -Scope Script -ErrorAction SilentlyContinue) { $script:isInvestigating } else { $false }
        $investigationStartTimeValue = if (Get-Variable -Name "investigationStartTime" -Scope Script -ErrorAction SilentlyContinue) { 
            if ($script:investigationStartTime -is [DateTime]) { $script:investigationStartTime } else { $null }
        } else { 
            $null 
        }
        $investigationTimeoutValue = if (Get-Variable -Name "investigationTimeout" -ErrorAction SilentlyContinue) { $investigationTimeout } else { 15 }
        $isVerifyingFixValue = if (Get-Variable -Name "isVerifyingFix" -ErrorAction SilentlyContinue) { $isVerifyingFix } else { $false }
        $verificationStartTimeValue = if (Get-Variable -Name "verificationStartTime" -ErrorAction SilentlyContinue) { 
            if ($verificationStartTime -is [DateTime]) { $verificationStartTime } else { $null }
        } else { 
            $null 
        }
        $verificationPeriodValue = if (Get-Variable -Name "verificationPeriod" -ErrorAction SilentlyContinue) { $verificationPeriod } else { 0 }
        $isPausedValue = if (Get-Variable -Name "isPaused" -ErrorAction SilentlyContinue) { $isPaused } else { $false }
        $currentIssueValue = if (Get-Variable -Name "currentIssue" -ErrorAction SilentlyContinue) { $currentIssue } else { $null }
        
        # Calculate uptime safely
        $uptimeValue = 0
        try {
            $now = Get-Date
            if ($statsStartTime -is [DateTime]) {
                $uptimeValue = ($now - $statsStartTime).TotalSeconds
            }
        } catch {
            $uptimeValue = 0
        }
        
        # Calculate investigation time remaining safely
        # CRITICAL: If investigation is not active, timeRemaining must be null (not 0)
        $investigationTimeRemaining = $null
        if ($isInvestigatingValue -and $investigationStartTimeValue -is [DateTime]) {
            try {
                $now = Get-Date
                $elapsed = ($now - $investigationStartTimeValue).TotalSeconds
                $investigationTimeRemaining = [Math]::Max(0, $investigationTimeoutValue - $elapsed)
            } catch {
                $investigationTimeRemaining = $null
            }
        } else {
            # CRITICAL: If investigation is not active, explicitly set timeRemaining to null
            # This prevents stale "0" values from appearing in status file
            $investigationTimeRemaining = $null
        }
        
        # Calculate verification time remaining safely
        $verificationTimeRemaining = $null
        if ($isVerifyingFixValue -and $verificationStartTimeValue -is [DateTime]) {
            try {
                $now = Get-Date
                $elapsed = ($now - $verificationStartTimeValue).TotalSeconds
                $verificationTimeRemaining = [Math]::Max(0, $verificationPeriodValue - $elapsed)
            } catch {
                $verificationTimeRemaining = $null
            }
        }
        
        $status = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            monitorRunning = $true
            monitorStartTime = $statsStartTime.ToString("o")
            uptime = $uptimeValue
            serverStatus = $statsServerStatus
            unityStatus = @{
                running = $statsUnityRunning
                connected = $statsUnityConnected
                actualStatus = $unityActualStatus
            }
            investigation = @{
                active = $isInvestigatingValue
                startTime = if ($investigationStartTimeValue -is [DateTime] -and $isInvestigatingValue) { $investigationStartTimeValue.ToString("o") } else { $null }
                timeout = $investigationTimeoutValue
                timeRemaining = if ($isInvestigatingValue) { $investigationTimeRemaining } else { $null }
            }
            verification = @{
                active = $isVerifyingFixValue
                startTime = if ($verificationStartTimeValue -is [DateTime]) { $verificationStartTimeValue.ToString("o") } else { $null }
                period = $verificationPeriodValue
                timeRemaining = $verificationTimeRemaining
            }
            paused = $isPausedValue
            currentIssue = $currentIssueValue
            pendingIssues = @{
                total = $statsPendingIssues
                inFocusMode = $statsInFocusMode
                queued = $statsQueuedIssues
            }
            statistics = @{
                linesProcessed = $statsTotalLinesProcessed
                issuesDetected = $statsIssuesDetected
                lastIssueTime = if ($statsLastIssueTime) { $statsLastIssueTime.ToString("o") } else { $null }
            }
            debuggerBreaks = @{
                successful = $statsPauseMarkersWritten
                failed = $statsPauseMarkerErrors
            }
            recentErrors = @()
            recentWarnings = @()
            recentIssues = @()
        }
        
        # Add recent issue detection info (last 10 issues)
        if (Get-Variable -Name "script:recentIssues" -ErrorAction SilentlyContinue) {
            $status.recentIssues = $script:recentIssues | Select-Object -Last 10
        }
        
        # Merge any additional status updates
        foreach ($key in $statusUpdate.Keys) {
            $status[$key] = $statusUpdate[$key]
        }
        
        # Get recent errors/warnings from pending issues
        if (Test-Path $pendingIssuesFile) {
            try {
                $pendingContent = Get-Content $pendingIssuesFile -Raw | ConvertFrom-Json
                if ($pendingContent.focusedGroup) {
                    $status.pendingIssues.rootIssue = @{
                        type = $pendingContent.focusedGroup.rootIssue.type
                        severity = $pendingContent.focusedGroup.rootIssue.severity
                        source = $pendingContent.focusedGroup.rootIssue.source
                        tableId = $pendingContent.focusedGroup.rootIssue.tableId
                    }
                    if ($pendingContent.focusedGroup.fixAttempts) {
                        $status.pendingIssues.fixAttempts = $pendingContent.focusedGroup.fixAttempts.Count
                        $status.pendingIssues.failedAttempts = ($pendingContent.focusedGroup.fixAttempts | Where-Object { $_.result -eq "failed" }).Count
                    }
                }
            } catch {
                # Ignore errors reading pending issues
            }
        }
        
        # Write to status file
        $statusFile = if (Get-Variable -Name "monitorStatusFile" -ErrorAction SilentlyContinue) { $monitorStatusFile } else { Join-Path $script:projectRoot "logs\monitor-status.json" }
        if (-not $statusFile) {
            $statusFile = Join-Path $script:projectRoot "logs\monitor-status.json"
        }
        $statusJson = $status | ConvertTo-Json -Depth 10
        # CRITICAL: Use FileStream with Flush to ensure data is written immediately
        $fileStream = [System.IO.File]::Open($statusFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
        $writer = New-Object System.IO.StreamWriter($fileStream, [System.Text.UTF8Encoding]::new($false))
        $writer.Write($statusJson)
        $writer.Flush()
        $fileStream.Flush()
        $writer.Close()
        $fileStream.Close()
    } catch {
        # Don't fail if status update fails - but log error for debugging
        # Write-Host "Update-MonitorStatus error: $_" -ForegroundColor Yellow
    }
}

# Function to automatically trigger debugger break with verification and retry
function Invoke-DebuggerBreakWithVerification {
    param(
        [string]$tableId = $null,
        [string]$reason = "Monitor detected critical issue",
        [string]$message = "Pausing debugger for issue inspection"
    )
    
    # Step 1: Verify Unity is ready before attempting break
    $unityStatus = Get-UnityActualStatus
    Update-MonitorStatus -statusUpdate @{
        lastDebuggerBreakAttempt = (Get-Date).ToUniversalTime().ToString("o")
        debuggerBreakStatus = "verifying_unity"
    }
    
    if (-not $unityStatus.ProcessRunning) {
        Write-ConsoleOutput -Message "  ERROR: Unity process not running - cannot pause debugger" -ForegroundColor "Red"
        Write-ConsoleOutput -Message "    Monitor will automatically restart Unity" -ForegroundColor "Yellow"
        Update-MonitorStatus -statusUpdate @{
            debuggerBreakStatus = "failed_unity_not_running"
            lastError = "Unity process not running when attempting debugger break"
        }
        return $false
    }
    
    if (-not $unityStatus.ConnectedToServer) {
        Write-ConsoleOutput -Message "  WARNING: Unity not connected to server - attempting break anyway (Unity may still receive event)" -ForegroundColor "Yellow"
        Write-ConsoleOutput -Message "    If Unity is in a table room, it will receive the event even if health check shows 0 players" -ForegroundColor "Gray"
        # Don't fail here - try to send the break anyway
        # Unity might be connected but health check might be wrong, or Unity might connect during the break attempt
    }
    
    # Step 2: If no tableId provided, automatically find active simulation table (non-blocking)
    if (-not $tableId) {
        try {
            $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
            if ($healthResult.Success) {
                $health = $healthResult.Content | ConvertFrom-Json
                if ($health.activeSimulations -gt 0) {
                    $tablesResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/tables" -TimeoutSec 2 -JobTimeout 3
                    if ($tablesResult.Success -and $tablesResult.StatusCode -eq 200) {
                        $tables = $tablesResult.Content | ConvertFrom-Json
                        $simTable = $tables | Where-Object { $_.isSimulation -eq $true -and $_.activePlayers -gt 0 } | Select-Object -First 1
                        if ($simTable -and $simTable.id) {
                            $tableId = $simTable.id
                            Write-ConsoleOutput -Message "  Auto-detected table: $tableId" -ForegroundColor "Cyan"
                        }
                    }
                }
            }
        } catch {
            # Failed to get table - will emit to all simulations
        }
    }
    
    # Step 3: Bring Unity window to foreground (required for debugger to work)
    try {
        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($unityProcess) {
            # Bring Unity window to foreground using Windows API
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern bool SetForegroundWindow(IntPtr hWnd);
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    [DllImport("user32.dll")]
                    public static extern bool IsIconic(IntPtr hWnd);
                    public const int SW_RESTORE = 9;
                    public const int SW_SHOW = 5;
                }
"@
            $unityWindow = $unityProcess.MainWindowHandle
            if ($unityWindow -ne [IntPtr]::Zero) {
                # Check if window is minimized
                if ([Win32]::IsIconic($unityWindow)) {
                    [Win32]::ShowWindow($unityWindow, [Win32]::SW_RESTORE)
                    Start-Sleep -Milliseconds 200
                }
                # Bring to foreground
                [Win32]::SetForegroundWindow($unityWindow)
                Write-ConsoleOutput -Message "  Unity window brought to foreground" -ForegroundColor "Cyan"
                Start-Sleep -Milliseconds 300  # Give Unity time to come to foreground
            } else {
                Write-ConsoleOutput -Message "  WARNING: Could not get Unity window handle - debugger may not pause if Unity is in background" -ForegroundColor "Yellow"
            }
        }
    } catch {
        Write-ConsoleOutput -Message "  WARNING: Failed to bring Unity to foreground: $_ - debugger may not pause if Unity is in background" -ForegroundColor "Yellow"
    }
    
    # Step 4: Send debugger break with automatic retry
    $maxRetries = 3
    $retryCount = 0
    $success = $false
    
    while ($retryCount -lt $maxRetries -and -not $success) {
        try {
            $body = @{
                tableId = $tableId
                reason = $reason
                message = $message
            } | ConvertTo-Json
            
            # Use async call (non-blocking) - this is fallback function, but still should be non-blocking
            $debuggerResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/debugger/break" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 -JobTimeout 6
            if (-not $debuggerResult.Success) {
                throw $debuggerResult.Error
            }
            $response = @{ StatusCode = $debuggerResult.StatusCode; Content = $debuggerResult.Content }
            
            if ($response.StatusCode -eq 200) {
                $result = $response.Content | ConvertFrom-Json
                if ($result.success -and $result.emittedCount -gt 0) {
                    $stats.PauseMarkersWritten++
                    Write-ConsoleOutput -Message "  Debugger break event emitted to Unity ($($result.emittedCount) table(s))" -ForegroundColor "Green"
                    if ($result.emittedTables) {
                        Write-ConsoleOutput -Message "  Tables: $($result.emittedTables -join ', ')" -ForegroundColor "Cyan"
                    }
                    Write-ConsoleOutput -Message "  Verifying Unity received and processed the pause..." -ForegroundColor "Yellow"
                    
                    # Wait a moment for Unity to process the event
                    Start-Sleep -Milliseconds 500
                    
                    # Check Unity logs for confirmation that it paused (limit to small read to avoid blocking)
                    $pauseConfirmed = $false
                    if (Test-Path $logFile) {
                        try {
                            # Use FileStream to read only last 50 lines efficiently (non-blocking for small reads)
                            $fileInfo = Get-Item $logFile
                            $maxBytes = 50 * 200  # Assume ~200 bytes per line max
                            $startPos = [Math]::Max(0, $fileInfo.Length - $maxBytes)
                            $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                            $fileStream.Position = $startPos
                            $reader = New-Object System.IO.StreamReader($fileStream)
                            $recentLogs = ($reader.ReadToEnd() -split "`n") | Select-Object -Last 50
                            $reader.Close()
                            $fileStream.Close()
                            
                            foreach ($logLine in $recentLogs) {
                                if ($logLine -match '\[Game\].*DEBUGGER BREAK|\[Game\].*PAUSED|Time\.timeScale.*0') {
                                    $pauseConfirmed = $true
                                    Write-ConsoleOutput -Message "  CONFIRMED: Unity received pause command (found in logs)" -ForegroundColor "Green"
                                    break
                                }
                            }
                        } catch {
                            # File read failed - skip confirmation check
                        }
                    }
                    
                    if (-not $pauseConfirmed) {
                        Write-ConsoleOutput -Message "  WARNING: Could not confirm Unity paused - check Unity console for 'DEBUGGER BREAK' or 'PAUSED' messages" -ForegroundColor "Yellow"
                        Write-ConsoleOutput -Message "  If Unity didn't pause, it may not be receiving the event or HandleDebuggerBreak isn't being called" -ForegroundColor "Yellow"
                    }
                    
                    Update-MonitorStatus -statusUpdate @{
                        debuggerBreakStatus = "success"
                        lastDebuggerBreakSuccess = (Get-Date).ToUniversalTime().ToString("o")
                        lastDebuggerBreakTables = $result.emittedTables
                        pauseConfirmed = $pauseConfirmed
                    }
                    $success = $true
                } elseif ($result.success -and $result.emittedCount -eq 0) {
                    # No tables received event - retry after checking Unity status
                    $retryCount++
                    if ($retryCount -lt $maxRetries) {
                        Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): No tables received event, verifying Unity status..." -ForegroundColor "Yellow"
                        Start-Sleep -Seconds 2
                        $unityStatus = Get-UnityActualStatus
                        if (-not $unityStatus.ConnectedToServer) {
                            Write-ConsoleOutput -Message "    Unity disconnected - will restart Unity automatically" -ForegroundColor "Yellow"
                            Restart-UnityIfNeeded | Out-Null
                            Start-Sleep -Seconds 5  # Wait for Unity to reconnect
                        }
                    } else {
                        Write-ConsoleOutput -Message "  ERROR: Failed after $maxRetries attempts - Unity may not be in a table room" -ForegroundColor "Red"
                        Write-ConsoleOutput -Message "    Monitor will continue monitoring - Unity will pause when it joins a table" -ForegroundColor "Yellow"
                        Update-MonitorStatus -statusUpdate @{
                            debuggerBreakStatus = "failed_no_tables"
                            lastError = "Debugger break failed after $maxRetries attempts - no tables received event"
                            lastErrorTime = (Get-Date).ToUniversalTime().ToString("o")
                        }
                    }
                } else {
                    throw "API returned success=false: $($result.error)"
                }
            } else {
                throw "API returned status code $($response.StatusCode)"
            }
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-ConsoleOutput -Message "  Retry $($retryCount)/$($maxRetries): Error - $($_.Exception.Message)" -ForegroundColor "Yellow"
                Start-Sleep -Seconds 2
            } else {
                $stats.PauseMarkerErrors++
                Write-ConsoleOutput -Message "  ERROR: Failed to trigger debugger break after $maxRetries attempts: $_" -ForegroundColor "Red"
                Update-MonitorStatus -statusUpdate @{
                    debuggerBreakStatus = "failed_exception"
                    lastError = "Debugger break exception after $maxRetries attempts: $_"
                    lastErrorTime = (Get-Date).ToUniversalTime().ToString("o")
                }
            }
        }
    }
    
    return $success
}

# Function to verify Unity is actually connected and playing (not just that a simulation table exists)
# Uses caching to avoid blocking the main loop
function Get-UnityActualStatus {
    # Return cached status if available and recent
    if ($script:unityStatusCache -and $script:unityStatusCacheTime) {
        $cacheAge = ((Get-Date) - $script:unityStatusCacheTime).TotalSeconds
        if ($cacheAge -lt $script:unityStatusCacheInterval) {
            return $script:unityStatusCache.Status
        }
    }
    
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
        
        # Check 1: Is Unity process running AND responding?
        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue
        $status.ProcessRunning = $null -ne $unityProcess
        if ($status.ProcessRunning) {
            # Bring Unity to foreground first to ensure we can check if it's responding
            # Unity may appear "not responding" if it's in background, so bring it forward
            try {
                $unityWindow = $unityProcess.MainWindowHandle
                if ($unityWindow -ne [IntPtr]::Zero) {
                    # Load Windows API functions if not already loaded
                    if (-not ([System.Management.Automation.PSTypeName]'Win32Unity').Type) {
                        Add-Type @"
                            using System;
                            using System.Runtime.InteropServices;
                            public class Win32Unity {
                                [DllImport("user32.dll")]
                                public static extern bool SetForegroundWindow(IntPtr hWnd);
                                [DllImport("user32.dll")]
                                public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                                [DllImport("user32.dll")]
                                public static extern bool IsIconic(IntPtr hWnd);
                                public const int SW_RESTORE = 9;
                                public const int SW_SHOW = 5;
                            }
"@
                    }
                    
                    # Check if window is minimized
                    if ([Win32Unity]::IsIconic($unityWindow)) {
                        [Win32Unity]::ShowWindow($unityWindow, [Win32Unity]::SW_RESTORE)
                        Start-Sleep -Milliseconds 200
                    }
                    # Bring to foreground
                    [Win32Unity]::SetForegroundWindow($unityWindow)
                    Start-Sleep -Milliseconds 300  # Give Unity time to come to foreground
                }
            } catch {
                # Failed to bring to foreground - continue anyway
            }
            
            # Check if Unity process is actually responding (not hung/crashed)
            # Wait a moment after bringing to foreground to check response
            Start-Sleep -Milliseconds 200
            $isResponding = $false
            try {
                $isResponding = $unityProcess.Responding
            } catch {
                # If we can't check Responding property, assume it's not responding
                $isResponding = $false
            }
            
            if (-not $isResponding) {
                $status.Details += "Process: Running but NOT responding (likely crashed/hung)"
                $status.Status = "CRASHED"
                # Cache status before returning
                $script:unityStatusCache = @{ Status = $status; HealthData = $null }
                $script:unityStatusCacheTime = Get-Date
                return $status
            }
            
            $status.Details += "Process: Running and responding (PID: $($unityProcess.Id))"
        } else {
            $status.Details += "Process: NOT running"
            $status.Status = "STOPPED"
            # Cache status before returning
            $script:unityStatusCache = @{ Status = $status; HealthData = $null }
            $script:unityStatusCacheTime = Get-Date
            return $status
        }
        
        # Check 2: Is Unity connected to server?
        $healthData = $null
        try {
            $healthCheck = Invoke-WebRequest -Uri "$serverUrl/health" -TimeoutSec 2 -ErrorAction Stop
            $healthData = $healthCheck.Content | ConvertFrom-Json
            $status.ConnectedToServer = $healthData.onlinePlayers -gt 0
            if ($status.ConnectedToServer) {
                $status.Details += "Server Connection: Connected ($($healthData.onlinePlayers) players online)"
                $status.LastConnectionActivity = Get-Date
            } else {
                $status.Details += "Server Connection: NOT connected (0 players online)"
            }
        } catch {
            $status.ConnectedToServer = $false
            $status.Details += "Server Connection: Health check failed - $($_.Exception.Message)"
        }
        
        # Check 3: Is Unity in a game scene (not MainMenuScene)?
        # If there are online players AND active simulations, Unity is likely in TableScene
        $hasActiveGame = $false
        if ($healthData -and $healthData.onlinePlayers -gt 0 -and $healthData.activeSimulations -gt 0) {
            $hasActiveGame = $true
            $status.Details += "Game Activity: Active simulation with $($healthData.onlinePlayers) players online"
        }
        if (Test-Path $logFile) {
            # Use efficient file reading to avoid blocking on large files (cached function, so OK to read more)
            $recentLines = @()
            try {
                $fileInfo = Get-Item $logFile -ErrorAction Stop
                $maxBytes = 500 * 200  # Assume ~200 bytes per line max
                $startPos = [Math]::Max(0, $fileInfo.Length - $maxBytes)
                $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $fileStream.Position = $startPos
                $reader = New-Object System.IO.StreamReader($fileStream)
                $recentLines = ($reader.ReadToEnd() -split "`n") | Select-Object -Last 500
                $reader.Close()
                $fileStream.Close()
            } catch {
                # File read failed - continue with empty array
            }
            $now = Get-Date
            $gameActivityFound = $false
            $connectionActivityFound = $false
            
            foreach ($line in $recentLines) {
                # Extract timestamp
                $lineTime = $null
                if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                    try {
                        $lineTime = [DateTime]::Parse($matches[1])
                        # Validate that parsed time is not in the future (more than 1 hour ahead)
                        # This catches timezone issues where log timestamps might be in different timezone
                        $timeDiff = ($lineTime - $now).TotalSeconds
                        if ($timeDiff -gt 3600) {
                            # Timestamp is more than 1 hour in the future - likely timezone issue, ignore it
                            $lineTime = $null
                        }
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
                        # Check for Unity client events OR game activity indicators
                        if ($line -match '\[SYSTEM\].*\[SOCKET\].*CLIENT_CONNECTED|REPORT_UNITY_LOG|\[UNITY\]|join_table.*success|action.*from.*client|login.*success|Unity.*connected|client.*connected.*socket|table_state|player_action|phase.*preflop|phase.*flop|phase.*turn|phase.*river|phase.*showdown') {
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
            
            # Unity is in game scene if we found game activity OR if there's an active simulation with players
            $status.InGameScene = $gameActivityFound -or $hasActiveGame
            $status.ReceivingGameUpdates = $gameActivityFound -or $hasActiveGame
            
            if ($gameActivityFound -and $status.LastGameActivity -and $status.LastGameActivity -is [DateTime]) {
                try {
                    $status.Details += "Game Activity: Active (last seen: $($status.LastGameActivity.ToString('HH:mm:ss')))"
                } catch {
                    $status.Details += "Game Activity: Active"
                }
            } else {
                $status.Details += "Game Activity: NONE (Unity may be in MainMenuScene or idle)"
            }
            
            if ($connectionActivityFound -and $status.LastConnectionActivity -and $status.LastConnectionActivity -is [DateTime]) {
                try {
                    $status.Details += "Connection Activity: Recent (last seen: $($status.LastConnectionActivity.ToString('HH:mm:ss')))"
                } catch {
                    $status.Details += "Connection Activity: Recent"
                }
            } else {
                $status.Details += "Connection Activity: NONE (no recent connection events)"
            }
        }
        
        # Determine overall status
        if (-not $status.ProcessRunning) {
            $status.Status = "STOPPED"
        } elseif (-not $status.ConnectedToServer) {
            $status.Status = "IDLE"
            $status.Details += "Unity process running but NOT connected to server"
        } elseif (-not $status.InGameScene) {
            $status.Status = "IDLE"
            $status.Details += "Unity connected but NOT in game scene (likely in MainMenuScene)"
        } elseif ($status.ReceivingGameUpdates) {
            $status.Status = "ACTIVE"
            $status.Details += "Unity is connected and actively playing"
        } else {
            $status.Status = "CONNECTED"
            $status.Details += "Unity connected but no recent game activity"
        }
        
        # Cache the status for non-blocking access
        $script:unityStatusCache = @{
            Status = $status
            HealthData = $healthData
        }
        $script:unityStatusCacheTime = Get-Date
        
        return $status
    } catch {
        $errorStatus = @{
            ProcessRunning = $false
            ConnectedToServer = $false
            InGameScene = $false
            ReceivingGameUpdates = $false
            Status = "ERROR"
            Details = @("Error checking Unity status: $($_.Exception.Message)")
        }
        # Cache error status too
        $script:unityStatusCache = @{ Status = $errorStatus; HealthData = $null }
        $script:unityStatusCacheTime = Get-Date
        return $errorStatus
    }
}

# Function to get Log Watcher status from recent logs
function Get-LogWatcherStatus {
    try {
        if (-not (Test-Path $logFile)) {
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        
        # Read last 1000 lines to find recent activity (increased to catch simulations that start after a delay)
        # Use efficient file reading to avoid blocking on large files
        $recentLines = @()
        try {
            $fileInfo = Get-Item $logFile -ErrorAction Stop
            $maxBytes = 1000 * 200  # Assume ~200 bytes per line max
            $startPos = [Math]::Max(0, $fileInfo.Length - $maxBytes)
            $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $fileStream.Position = $startPos
            $reader = New-Object System.IO.StreamReader($fileStream)
            $recentLines = ($reader.ReadToEnd() -split "`n") | Select-Object -Last 1000
            $reader.Close()
            $fileStream.Close()
        } catch {
            # File read failed - return default
            return @{ Active = $false; PausedTables = 0; ActiveSimulations = 0; LastSeen = $null }
        }
        if (-not $recentLines -or $recentLines.Count -eq 0) {
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

# Function to kill processes using port 3000
function Kill-Port3000Processes {
    $msg = "[$(Get-Date -Format 'HH:mm:ss')] Killing processes using port 3000..."
    Write-ConsoleOutput -Message $msg -ForegroundColor "Cyan"
    $port3000Processes = @()
    try {
        $portPattern = ':3000'
        $netstatOutput = netstat -ano | Select-String $portPattern
        foreach ($line in $netstatOutput) {
            if ($line -match '\s+(\d+)\s*$') {
                $processId = [int]$matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process -and $process.ProcessName -eq 'node') {
                        # Only kill node.exe processes, not PowerShell or other clients
                        $port3000Processes += $process
                    }
                } catch {
                    # Process might have already terminated
                }
            }
        }
    } catch {
        $portErrorMsg = "[$(Get-Date -Format 'HH:mm:ss')] Could not check port 3000: $_"
        Write-ConsoleOutput -Message $portErrorMsg -ForegroundColor "Yellow"
    }
    
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    
    $allProcessesToKill = @{}
    foreach ($proc in $port3000Processes) {
        $allProcessesToKill[$proc.Id] = $proc
    }
    foreach ($proc in $nodeProcesses) {
        $allProcessesToKill[$proc.Id] = $proc
    }
    
    if ($allProcessesToKill.Count -gt 0) {
        $msg = "[$(Get-Date -Format 'HH:mm:ss')] Killing $($allProcessesToKill.Count) process(es) using port 3000..."
        Write-ConsoleOutput -Message $msg -ForegroundColor "Cyan"
        foreach ($proc in $allProcessesToKill.Values) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                $killedMsg = "[$(Get-Date -Format 'HH:mm:ss')] Killed process: $($proc.ProcessName) (PID: $($proc.Id))"
                Write-ConsoleOutput -Message $killedMsg -ForegroundColor "Green"
            } catch {
                $killFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Could not kill process $($proc.Id): $_"
                Write-ConsoleOutput -Message $killFailMsg -ForegroundColor "Yellow"
            }
        }
        Start-Sleep -Milliseconds 500  # Reduced from 2 seconds
        $msg = "[$(Get-Date -Format 'HH:mm:ss')] Killed all processes using port 3000"
        Write-ConsoleOutput -Message $msg -ForegroundColor "Green"
    } else {
        $msg = "[$(Get-Date -Format 'HH:mm:ss')] No processes found using port 3000"
        Write-ConsoleOutput -Message $msg -ForegroundColor "Gray"
    }
}

# Function to display statistics in a formatted layout
function Show-Statistics {
    # AI-FIRST: Always use AI-powered statistics (no fallback to legacy)
    if ($script:aiIntegrationEnabled) {
        try {
            $aiStats = Get-AILiveStatistics
            if ($aiStats) {
                Show-BrokenPromiseStatistics -LegacyStats $stats -LogFile $logFile -ServerUrl $serverUrl
                return
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [ERROR] AI statistics unavailable - display may be incomplete" -ForegroundColor "Red"
                # Still show basic info even if AI stats fail
            }
        } catch {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [ERROR] AI statistics failed: $_" -ForegroundColor "Red"
            # Still show basic info even if AI stats fail
        }
    }
    
    # FALLBACK: Only if AI integration is completely disabled
    # (This should never happen in normal operation)
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
            # Re-check status after restart attempt (non-blocking - will check in next update)
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
    
    # Get server's ACTUAL simulation count for display (not stale log data) - non-blocking
    $serverActualSimCount = 0
    try {
        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -Method GET -TimeoutSec 2 -JobTimeout 3
        if ($healthResult.Success) {
            $healthData = $healthResult.Content | ConvertFrom-Json
            $serverActualSimCount = $healthData.activeSimulations
        }
    } catch {
        # Health check failed - log the error but default to 0
        $healthErrorDetails = $_.Exception.Message
        if ($_.Exception.Response) {
            $healthErrorDetails += " (Status: $($_.Exception.Response.StatusCode))"
        }
        # Don't spam errors - only log once per minute
        if (-not $script:lastHealthCheckError -or ((Get-Date) - $script:lastHealthCheckError).TotalSeconds -gt 60) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Health check failed - $healthErrorDetails" -ForegroundColor "Yellow"
            $script:lastHealthCheckError = Get-Date
        }
        $serverActualSimCount = 0
    }
    # Override log watcher count with server's actual count for display
    $logWatcherStatus.ActiveSimulations = $serverActualSimCount
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
    # Status priority: Verifying > Investigating > Paused > Active
    # During verification, Unity remains paused (isPaused stays true), so show both states
    # CRITICAL: Read status from status file to avoid sync issues
    $statusFromFile = "ACTIVE"
    $pausedFromFile = $false
    # Use same path resolution as investigation section (reuse if already calculated)
    $statusTextFilePath = $statusFilePath
    if (-not $statusTextFilePath -or -not (Test-Path $statusTextFilePath)) {
        $scriptRoot = $null
        if ($PSScriptRoot) {
            $scriptRoot = $PSScriptRoot
        } elseif ($MyInvocation.MyCommand.Path) {
            $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    } else {
            $scriptRoot = if (Test-Path "monitoring\BrokenPromise.ps1") { "monitoring" } elseif (Test-Path "logs\monitor-status.json") { "." } else { Get-Location }
        }
        $statusTextFilePath = Join-Path $scriptRoot "..\logs\monitor-status.json" | Resolve-Path -ErrorAction SilentlyContinue
        if (-not $statusTextFilePath) {
            $statusTextFilePath = Join-Path (Get-Location) "logs\monitor-status.json"
            if (-not (Test-Path $statusTextFilePath)) {
                $statusTextFilePath = "C:\Projects\poker-server\logs\monitor-status.json"
            }
        }
    }
    if (Test-Path $statusTextFilePath) {
        try {
            $statusData = Get-Content $statusTextFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($statusData.verification -and $statusData.verification.active -is [bool] -and $statusData.verification.active) {
                $statusFromFile = "VERIFYING FIX (Unity Paused)"
            } elseif ($statusData.investigation -and $statusData.investigation.active -is [bool] -and $statusData.investigation.active) {
                $statusFromFile = "INVESTIGATING"
            } elseif ($statusData.paused -is [bool] -and $statusData.paused) {
                $statusFromFile = "PAUSED (Fix Required)"
                $pausedFromFile = $true
            }
        } catch {
            # Status file read failed - fall back to variables
            Write-Error "Show-Statistics: Failed to read status from status file: $_" -ErrorAction SilentlyContinue
            $statusFromFile = if ($isVerifyingFix) { "VERIFYING FIX (Unity Paused)" } elseif ($script:isInvestigating) { "INVESTIGATING" } elseif ($isPaused) { "PAUSED (Fix Required)" } else { "ACTIVE" }
        }
    } else {
        # No status file - fall back to variables
        $statusFromFile = if ($isVerifyingFix) { "VERIFYING FIX (Unity Paused)" } elseif ($script:isInvestigating) { "INVESTIGATING" } elseif ($isPaused) { "PAUSED (Fix Required)" } else { "ACTIVE" }
    }
    $statusText = $statusFromFile
    $statusColor = if ($isVerifyingFix) { "Cyan" } elseif ($script:isInvestigating) { "Yellow" } elseif ($isPaused) { "Red" } else { "Green" }
    $serverStatusText = if ($stats.ServerStatus -eq "Online") { "ONLINE" } else { "OFFLINE" }
    $serverStatusColor = if ($stats.ServerStatus -eq "Online") { "Green" } else { "Red" }
    $pipeSeparator = [char]124
    $separatorStr = " $pipeSeparator "
    
    Write-Host ""
    Write-Host "STATUS: " -NoNewline -ForegroundColor White
    Write-Host $statusText -NoNewline -ForegroundColor $statusColor
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "UPTIME: " -NoNewline -ForegroundColor White
    Write-Host $uptimeStr -NoNewline -ForegroundColor Yellow
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "SERVER: " -NoNewline -ForegroundColor White
    Write-Host $serverStatusText -NoNewline -ForegroundColor $serverStatusColor
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "UNITY: " -NoNewline -ForegroundColor White
    Write-Host $unityStatus -NoNewline -ForegroundColor $unityColor
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "SIM: " -NoNewline -ForegroundColor White
    Write-Host $simStatus -NoNewline -ForegroundColor $simColor
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
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
    $col1Lines += "Server: " + $stats.ServerStatus
    $col1Lines += "Simulations: " + $logWatcherStatus.ActiveSimulations
    $dbStatus = $(if($stats.ServerStatus -eq "Online"){"CONNECTED"}else{"UNKNOWN"})
    $col1Lines += "Database: " + $dbStatus
    $col1Lines += ""
    
    # MONITOR STATE - Critical information about what monitor is doing
    $col1Lines += "MONITOR STATE"
    $col1Lines += ("-" * ($colWidth - 2))
    
    # Check if Unity is paused and waiting for fix
    $pausedFromStatusFile = $false
    $fixAppliedExists = Test-Path $fixAppliedFile
    if (Test-Path $statusTextFilePath) {
        try {
            $statusData = Get-Content $statusTextFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            $pausedFromStatusFile = if ($statusData.paused -is [bool]) { $statusData.paused } else { $false }
        } catch {
            $pausedFromStatusFile = $isPaused
        }
    } else {
        $pausedFromStatusFile = $isPaused
    }
    
    if ($pausedFromStatusFile) {
        $col1Lines += "Unity Status: PAUSED"
        if ($fixAppliedExists) {
            $col1Lines += "Waiting: VERIFYING"
            try {
                $fixApplied = Get-FixAppliedInfo
                if ($fixApplied) {
                    $col1Lines += "Fix Applied: YES"
                    if ($fixApplied.requiredRestarts -and $fixApplied.requiredRestarts.Count -gt 0) {
                        $restartsText = ($fixApplied.requiredRestarts -join ",")
                        if ($restartsText.Length -gt ($colWidth - 12)) {
                            $restartsText = $restartsText.Substring(0, ($colWidth - 15)) + "..."
                        }
                        $col1Lines += "Restarts: " + $restartsText
                    }
                }
            } catch {
                $col1Lines += "Fix Applied: ERROR"
            }
        } else {
            $col1Lines += "Waiting: FIX REQUIRED"
            $col1Lines += "fix-applied.json: MISSING"
            $col1Lines += ""
            $col1Lines += "ACTION: Create fix-applied.json"
            $col1Lines += "  with fix details"
        }
    } else {
        $col1Lines += "Unity Status: ACTIVE"
        $col1Lines += "Waiting: NONE"
    }
    
    # Show what monitor is currently doing
    $col1Lines += ""
    $col1Lines += "Current Action:"
    if ($isVerifyingFix) {
        $col1Lines += "  VERIFYING FIX"
        if ($verificationStartTimeValue) {
            $verificationElapsed = (Get-Date) - $verificationStartTimeValue
            $col1Lines += "  Elapsed: " + ("{0:N0}s" -f $verificationElapsed.TotalSeconds)
        }
    } elseif ($investigationActive) {
        $col1Lines += "  INVESTIGATING"
        if ($investigationStartTimeValue) {
            $investigationElapsed = (Get-Date) - $investigationStartTimeValue
            $col1Lines += "  Elapsed: " + ("{0:N0}s" -f $investigationElapsed.TotalSeconds)
        }
    } elseif ($pausedFromStatusFile) {
        $col1Lines += "  WAITING FOR FIX"
    } else {
        $col1Lines += "  MONITORING LOGS"
    }
    
    $col1Lines += ""
    $col1Lines += "AUTOMATION"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Mode: " + $config.mode.ToUpper()
    $serverRestart = $(if($config.automation.autoRestartServer){"ENABLED"}else{"DISABLED"})
    $col1Lines += "Auto-Restart Server: " + $serverRestart
    $unityRestart = $(if($config.automation.autoRestartUnity){"ENABLED"}else{"DISABLED"})
    $col1Lines += "Auto-Restart Unity: " + $unityRestart
    $dbRestart = $(if($config.automation.autoRestartDatabase){"ENABLED"}else{"DISABLED"})
    $col1Lines += "Auto-Restart DB: " + $dbRestart
    
    # Column 2: Detection & Issues
    $col2Lines += "DETECTION STATS"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "Lines: " + ("{0:N0}" -f $stats.TotalLinesProcessed)
    $col2Lines += "Issues: " + ("{0:N0}" -f $stats.IssuesDetected)
    $col2Lines += "Patterns: " + $stats.UniquePatterns.Count
    $col2Lines += "Log Size: " + ("{0:N2} MB" -f $stats.LogFileSize)
    # Add diagnostic info
    $logFileSizeMB = if (Test-Path $logFile) { [Math]::Round((Get-Item $logFile).Length / 1MB, 2) } else { 0 }
    $logPositionDiff = if (Test-Path $logFile) { (Get-Item $logFile).Length - $lastLogPosition } else { 0 }
    $col2Lines += ""
    $col2Lines += "DIAGNOSTICS"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "File Size: ${logFileSizeMB}MB"
    $col2Lines += "Position: $lastLogPosition"
    $col2Lines += "Bytes to Read: $logPositionDiff"
    if ($stats.LastIssueTime) {
        $col2Lines += "Last Issue: " + $stats.LastIssueTime.ToString("HH:mm:ss")
    }
    $col2Lines += "Debugger Breaks: " + $stats.PauseMarkersWritten
    if ($stats.PauseMarkerErrors -gt 0) {
        $col2Lines += "Break Errors: " + $stats.PauseMarkerErrors
    }
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
    # Investigation info moved to full-width row - column 3 now only shows summary
    $col3Lines += "PENDING ISSUES"
    $col3Lines += ("-" * ($colWidth - 2))
    if ($pendingInfo.InFocusMode) {
        $col3Lines += "Mode: FOCUS MODE"
        $col3Lines += "Total: " + $pendingInfo.TotalIssues
    } else {
        $col3Lines += "Mode: NORMAL"
        $col3Lines += "Pending: " + $pendingInfo.TotalIssues
    }
    
    # Add investigation section (always visible, shows status)
    # CRITICAL: Read from status file to avoid sync issues with variable timers
    $investigationActive = $false
    $investigationStartTimeValue = $null
    $investigationTimeRemaining = $null
    # Use script root directory (where BrokenPromise.ps1 is located)
    # Try multiple methods to get script path
    $scriptRoot = $null
    if ($PSScriptRoot) {
        $scriptRoot = $PSScriptRoot
    } elseif ($MyInvocation.MyCommand.Path) {
        $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    } else {
        # Fallback: assume we're in the monitoring directory or project root
        $scriptRoot = if (Test-Path "monitoring\BrokenPromise.ps1") { "monitoring" } elseif (Test-Path "logs\monitor-status.json") { "." } else { Get-Location }
    }
    $statusFilePath = Join-Path $scriptRoot "..\logs\monitor-status.json" | Resolve-Path -ErrorAction SilentlyContinue
    if (-not $statusFilePath) {
        # Fallback to relative path from current location
        $statusFilePath = Join-Path (Get-Location) "logs\monitor-status.json"
        if (-not (Test-Path $statusFilePath)) {
            # Last resort: try absolute path from known project structure
            $statusFilePath = "C:\Projects\poker-server\logs\monitor-status.json"
        }
    }
    if (Test-Path $statusFilePath) {
        try {
            $statusData = Get-Content $statusFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($statusData.investigation) {
                $investigationActive = if ($statusData.investigation.active -is [bool]) { $statusData.investigation.active } else { [bool]$statusData.investigation.active }
                if ($statusData.investigation.startTime) {
                    try {
                        $investigationStartTimeValue = [DateTime]::Parse($statusData.investigation.startTime)
                    } catch {
                        # Invalid date - ignore
                    }
                }
                if ($statusData.investigation.timeRemaining) {
                    $investigationTimeRemaining = $statusData.investigation.timeRemaining
                }
            }
        } catch {
            # Status file read failed - fall back to variables with diagnostic
            Write-Error "Show-Statistics: Failed to read status file ($statusFilePath): $_" -ErrorAction SilentlyContinue
            $investigationActive = $script:isInvestigating
            $investigationStartTimeValue = $script:investigationStartTime
        }
    } else {
        # No status file - fall back to variables
        $investigationActive = $script:isInvestigating
        $investigationStartTimeValue = $script:investigationStartTime
    }
    
    # Build investigation phase info in COLUMN LAYOUT (ALWAYS SHOWN, organized in 3 columns)
    $investigationCol1Lines = @()
    $investigationCol2Lines = @()
    $investigationCol3Lines = @()
    
    # Get fix attempts from pending-issues.json if available
    $fixAttemptsInfo = @{
        Total = 0
        Failed = 0
        Success = 0
        Attempts = @()
    }
    try {
        if (Test-Path $pendingIssuesFile) {
            $pendingContent = Get-Content $pendingIssuesFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($pendingContent.focusedGroup -and $pendingContent.focusedGroup.fixAttempts) {
                $fixAttemptsInfo.Total = $pendingContent.focusedGroup.fixAttempts.Count
                $fixAttemptsInfo.Failed = ($pendingContent.focusedGroup.fixAttempts | Where-Object { $_.result -eq "failed" }).Count
                $fixAttemptsInfo.Success = ($pendingContent.focusedGroup.fixAttempts | Where-Object { $_.result -eq "success" }).Count
                $fixAttemptsInfo.Attempts = $pendingContent.focusedGroup.fixAttempts
            }
        }
    } catch {
        # Failed to read fix attempts - continue
    }
    
    # Calculate investigation status (always show, even when not active)
    $investigationElapsed = $null
    $elapsedSeconds = 0
    $remaining = 0
    $elapsed = 0
    $progressPercent = 0
    $progressBar = ""
    if ($investigationActive -and $investigationStartTimeValue) {
        $investigationElapsed = (Get-Date) - $investigationStartTimeValue
        if ($investigationTimeRemaining -ne $null) {
            $remaining = $investigationTimeRemaining
            $elapsed = $investigationTimeout - $remaining
        } else {
            $investigationElapsed = (Get-Date) - $investigationStartTimeValue
            $remaining = [Math]::Max(0, $investigationTimeout - $investigationElapsed.TotalSeconds)
            $elapsed = [Math]::Min($investigationTimeout, $investigationElapsed.TotalSeconds)
        }
        $progressPercent = [Math]::Round(($elapsed / $investigationTimeout) * 100)
        $elapsedSeconds = $investigationElapsed.TotalSeconds
        $progressBarWidth = $colWidth - 8
        $filled = [Math]::Round(($elapsed / $investigationTimeout) * $progressBarWidth)
        $empty = $progressBarWidth - $filled
        $progressBar = "[" + ("#" * $filled) + ("-" * $empty) + "]"
    }
    
    # COLUMN 1: Status & Root Issue
    $investigationCol1Lines += "INVESTIGATION STATUS"
    $investigationCol1Lines += ("-" * ($colWidth - 2))
    if ($investigationActive -and $investigationStartTimeValue) {
        $investigationCol1Lines += "Status: ACTIVE"
        $elapsedStr = "{0:N1}s" -f $elapsedSeconds
        $timeoutStr = "{0:N0}s" -f $investigationTimeout
        $remainingStr = "{0:N1}s" -f $remaining
        $progressStr = "{0:N1}%" -f $progressPercent
        $startTimeStr = $investigationStartTimeValue.ToString("HH:mm:ss")
        $investigationCol1Lines += "Started: $startTimeStr"
        $investigationCol1Lines += "Elapsed: $elapsedStr"
        $investigationCol1Lines += "Remaining: $remainingStr"
        $investigationCol1Lines += "Progress: $progressStr"
        $investigationCol1Lines += ""
        $investigationCol1Lines += $progressBar
    } else {
        $investigationCol1Lines += "Status: NOT ACTIVE"
        $investigationCol1Lines += "Timeout: " + ("{0:N0}s" -f $investigationTimeout)
        $investigationCol1Lines += "Enabled: " + $(if($investigationEnabled){"YES"}else{"NO"})
        if ($pausedFromStatusFile) {
            if ($fixAppliedExists) {
                $investigationCol1Lines += "Waiting: VERIFY"
            } else {
                $investigationCol1Lines += "Waiting: FIX"
            }
        } else {
            $investigationCol1Lines += "Waiting: ISSUES"
        }
    }
    $investigationCol1Lines += ""
    $investigationCol1Lines += "ROOT ISSUE"
    $investigationCol1Lines += ("-" * ($colWidth - 2))
    if ($pendingInfo -and $pendingInfo.RootIssue) {
        $rootIssue = $pendingInfo.RootIssue
        $investigationCol1Lines += "Type: " + $rootIssue.type
        $investigationCol1Lines += "Severity: " + $rootIssue.severity.ToUpper()
        if ($rootIssue.source) {
            $sourceText = $rootIssue.source
            if ($sourceText.Length -gt ($colWidth - 8)) { $sourceText = $sourceText.Substring(0, ($colWidth - 11)) + "..." }
            $investigationCol1Lines += "Source: " + $sourceText
        }
        if ($rootIssue.tableId) {
            $tableIdShort = if ($rootIssue.tableId.Length -gt ($colWidth - 8)) { $rootIssue.tableId.Substring(0, ($colWidth - 11)) + "..." } else { $rootIssue.tableId }
            $investigationCol1Lines += "Table: " + $tableIdShort
        }
    } else {
        $investigationCol1Lines += "No root issue"
        $investigationCol1Lines += "(No focus group)"
    }
    
    # COLUMN 2: Related Issues
    $investigationCol2Lines += "RELATED ISSUES"
    $investigationCol2Lines += ("-" * ($colWidth - 2))
    if ($pendingInfo -and $pendingInfo.InFocusMode) {
        if ($pendingInfo.RelatedIssuesCount -gt 0) {
            $investigationCol2Lines += "Total: " + $pendingInfo.RelatedIssuesCount
            $investigationCol2Lines += ""
            if ($pendingInfo.RelatedIssues -and $pendingInfo.RelatedIssues.Count -gt 0) {
                $relatedTypes = @{}
                $relatedBySeverity = @{}
                foreach ($related in $pendingInfo.RelatedIssues) {
                    $type = if ($related.type) { $related.type } else { "unknown" }
                    $severity = if ($related.severity) { $related.severity } else { "unknown" }
                    if (-not $relatedTypes.ContainsKey($type)) { $relatedTypes[$type] = 0 }
                    if (-not $relatedBySeverity.ContainsKey($severity)) { $relatedBySeverity[$severity] = 0 }
                    $relatedTypes[$type]++
                    $relatedBySeverity[$severity]++
                }
                $investigationCol2Lines += "By Type:"
                $relatedSorted = $relatedTypes.GetEnumerator() | Sort-Object Value -Descending
                foreach ($typeEntry in $relatedSorted) {
                    $typeText = $typeEntry.Key + ": " + $typeEntry.Value
                    if ($typeText.Length -gt ($colWidth - 2)) { $typeText = $typeText.Substring(0, ($colWidth - 5)) + "..." }
                    $investigationCol2Lines += "  " + $typeText
                }
                $investigationCol2Lines += ""
                $investigationCol2Lines += "By Severity:"
                $severitySorted = $relatedBySeverity.GetEnumerator() | Sort-Object Value -Descending
                foreach ($severityEntry in $severitySorted) {
                    $investigationCol2Lines += "  " + $severityEntry.Key.ToUpper() + ": " + $severityEntry.Value
                }
            }
        } else {
            $investigationCol2Lines += "Gathering..."
        }
    } else {
        $investigationCol2Lines += "No related issues"
        $investigationCol2Lines += "(Focus: INACTIVE)"
    }
    
    # COLUMN 3: Fix Attempts & Focus Mode
    $investigationCol3Lines += "FIX ATTEMPTS"
    $investigationCol3Lines += ("-" * ($colWidth - 2))
    if ($fixAttemptsInfo.Total -gt 0) {
        $successRate = if ($fixAttemptsInfo.Total -gt 0) { [Math]::Round(($fixAttemptsInfo.Success / $fixAttemptsInfo.Total) * 100, 1) } else { 0 }
        $investigationCol3Lines += "Total: " + $fixAttemptsInfo.Total
        $investigationCol3Lines += "Success: " + $fixAttemptsInfo.Success
        $investigationCol3Lines += "Failed: " + $fixAttemptsInfo.Failed
        $investigationCol3Lines += "Rate: " + ("{0:N1}%" -f $successRate)
        $investigationCol3Lines += ""
        $investigationCol3Lines += "Recent:"
        $recentAttempts = $fixAttemptsInfo.Attempts | Sort-Object { if ($_.timestamp) { [DateTime]::Parse($_.timestamp) } else { [DateTime]::MinValue } } -Descending | Select-Object -First 3
        foreach ($attempt in $recentAttempts) {
            $result = if ($attempt.result) { $attempt.result.ToUpper() } else { "UNK" }
            $timestamp = if ($attempt.timestamp) {
                try { [DateTime]::Parse($attempt.timestamp).ToString("HH:mm:ss") } catch { "???" }
            } else { "???" }
            $investigationCol3Lines += "  [$timestamp]"
            $investigationCol3Lines += "    $result"
            if ($attempt.fixDescription) {
                $desc = $attempt.fixDescription
                if ($desc.Length -gt ($colWidth - 6)) { $desc = $desc.Substring(0, ($colWidth - 9)) + "..." }
                $investigationCol3Lines += "    $desc"
            }
        }
    } else {
        $investigationCol3Lines += "No attempts yet"
    }
    $investigationCol3Lines += ""
    $investigationCol3Lines += "FOCUS MODE"
    $investigationCol3Lines += ("-" * ($colWidth - 2))
    if ($pendingInfo -and $pendingInfo.InFocusMode) {
        $investigationCol3Lines += "Status: ACTIVE"
        $investigationCol3Lines += "Total: " + $pendingInfo.TotalIssues
        $investigationCol3Lines += "Root: 1"
        $investigationCol3Lines += "Related: " + $pendingInfo.RelatedIssuesCount
        $investigationCol3Lines += "Queued: " + $pendingInfo.QueuedIssuesCount
        if ($pendingInfo.GroupId) {
            $groupIdShort = if ($pendingInfo.GroupId.Length -gt ($colWidth - 10)) { $pendingInfo.GroupId.Substring(0, ($colWidth - 13)) + "..." } else { $pendingInfo.GroupId }
            $investigationCol3Lines += ""
            $investigationCol3Lines += "Group ID:"
            $investigationCol3Lines += $groupIdShort
        }
    } else {
        $investigationCol3Lines += "Status: INACTIVE"
        $investigationCol3Lines += "Total: " + $pendingInfo.TotalIssues
    }
    
    # Add verification progress if verifying
    # CRITICAL: Read from status file to avoid sync issues
    $verificationActive = $false
    $verificationStartTimeValue = $null
    $verificationTimeRemaining = $null
    # Use same path resolution as investigation section
    $verificationStatusFilePath = $statusFilePath
    if (-not $verificationStatusFilePath -or -not (Test-Path $verificationStatusFilePath)) {
        $scriptRoot = $null
        if ($PSScriptRoot) {
            $scriptRoot = $PSScriptRoot
        } elseif ($MyInvocation.MyCommand.Path) {
            $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
        } else {
            $scriptRoot = if (Test-Path "monitoring\BrokenPromise.ps1") { "monitoring" } elseif (Test-Path "logs\monitor-status.json") { "." } else { Get-Location }
        }
        $verificationStatusFilePath = Join-Path $scriptRoot "..\logs\monitor-status.json" | Resolve-Path -ErrorAction SilentlyContinue
        if (-not $verificationStatusFilePath) {
            $verificationStatusFilePath = Join-Path (Get-Location) "logs\monitor-status.json"
            if (-not (Test-Path $verificationStatusFilePath)) {
                $verificationStatusFilePath = "C:\Projects\poker-server\logs\monitor-status.json"
            }
        }
    }
    if (Test-Path $verificationStatusFilePath) {
        try {
            $statusData = Get-Content $verificationStatusFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            if ($statusData.verification) {
                $verificationActive = $statusData.verification.active
                if ($statusData.verification.startTime) {
                    try {
                        $verificationStartTimeValue = [DateTime]::Parse($statusData.verification.startTime)
                    } catch {
                        # Invalid date - ignore
                    }
                }
                if ($statusData.verification.timeRemaining) {
                    $verificationTimeRemaining = $statusData.verification.timeRemaining
                }
            }
        } catch {
            # Status file read failed - fall back to variables
            $verificationActive = $isVerifyingFix
            $verificationStartTimeValue = $verificationStartTime
        }
    } else {
        # No status file - fall back to variables
        $verificationActive = $isVerifyingFix
        $verificationStartTimeValue = $verificationStartTime
    }
    
    if ($verificationActive -and $verificationStartTimeValue) {
        $col3Lines += ""
        $col3Lines += "VERIFICATION"
        $col3Lines += ("-" * ($colWidth - 2))
        # Use timeRemaining from status file if available, otherwise calculate
        if ($verificationTimeRemaining -ne $null) {
            $remaining = $verificationTimeRemaining
            $elapsed = $verificationPeriod - $remaining
    } else {
            $verificationElapsed = (Get-Date) - $verificationStartTimeValue
            $remaining = [Math]::Max(0, $verificationPeriod - $verificationElapsed.TotalSeconds)
            $elapsed = [Math]::Min($verificationPeriod, $verificationElapsed.TotalSeconds)
        }
        $col3Lines += "Progress: " + ("{0:N0}s" -f $elapsed) + " / " + ("{0:N0}s" -f $verificationPeriod)
        $col3Lines += "Time Left: " + ("{0:N0}s" -f $remaining)
        
        # Show what's being verified
        if ($verificationIssuePattern) {
            $patternText = "$($verificationIssuePattern.type) from $($verificationIssuePattern.source)"
            if ($verificationIssuePattern.tableId) {
                $tableShort = if ($verificationIssuePattern.tableId.Length -gt 8) { $verificationIssuePattern.tableId.Substring(0, 8) + ".." } else { $verificationIssuePattern.tableId }
                $patternText += " (t:$tableShort)"
            }
            if ($patternText.Length -gt ($colWidth - 11)) {  # "Watching: " prefix
                $patternText = $patternText.Substring(0, ($colWidth - 14)) + "..."
            }
            $col3Lines += "Watching: " + $patternText
        }
        
        # Show fix-applied info if available
        $fixApplied = Get-FixAppliedInfo
        if ($fixApplied) {
            if ($fixApplied.requiredRestarts -and $fixApplied.requiredRestarts.Count -gt 0) {
                $restartsText = ($fixApplied.requiredRestarts -join ", ")
                if ($restartsText.Length -gt ($colWidth - 11)) {  # "Restarts: " prefix
                    $restartsText = $restartsText.Substring(0, ($colWidth - 14)) + "..."
                }
                $col3Lines += "Restarts: " + $restartsText
            }
        }
    }
    
    # Add current issue preview if paused, investigating, or verifying
    if (($isPaused -or $script:isInvestigating -or $isVerifyingFix) -and $currentIssue) {
        $col3Lines += ""
        $col3Lines += "CURRENT ISSUE"
        $col3Lines += ("-" * ($colWidth - 2))
        $issuePreview = $currentIssue
        # Remove timestamp prefix (e.g., "[2026-02-08 03:02:51.829] ") to show more of the actual issue
        if ($issuePreview -match '^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\]\s*(.+)$') {
            $issuePreview = $matches[1]
        }
        # Truncate to fit column width
        if ($issuePreview.Length -gt ($colWidth - 2)) {
            $issuePreview = $issuePreview.Substring(0, ($colWidth - 5)) + "..."
        }
        $col3Lines += $issuePreview
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
        Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
        Write-Host ($line2.PadRight($colWidth)) -NoNewline -ForegroundColor $c2
        Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
        Write-Host ($line3.PadRight($colWidth)) -NoNewline -ForegroundColor $c3
        Write-Host ""
    }
    
    # Display investigation phase in column layout (ALWAYS SHOWN)
    Write-Host ""
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    $investigationMaxLines = [Math]::Max($investigationCol1Lines.Count, [Math]::Max($investigationCol2Lines.Count, $investigationCol3Lines.Count))
    for ($i = 0; $i -lt $investigationMaxLines; $i++) {
        $invLine1 = if ($i -lt $investigationCol1Lines.Count) { $investigationCol1Lines[$i] } else { "" }
        $invLine2 = if ($i -lt $investigationCol2Lines.Count) { $investigationCol2Lines[$i] } else { "" }
        $invLine3 = if ($i -lt $investigationCol3Lines.Count) { $investigationCol3Lines[$i] } else { "" }
        
        # Determine colors for investigation columns
        $invC1 = if ($invLine1 -match "ACTIVE|ENABLED") { "Green" } elseif ($invLine1 -match "NOT ACTIVE|INACTIVE|DISABLED") { "Yellow" } elseif ($invLine1 -match "INVESTIGATION|ROOT ISSUE") { "Cyan" } else { "White" }
        $invC2 = if ($invLine2 -match "RELATED ISSUES") { "Cyan" } else { "White" }
        $invC3 = if ($invLine3 -match "SUCCESS") { "Green" } elseif ($invLine3 -match "FAILED|Failed") { "Red" } elseif ($invLine3 -match "FIX ATTEMPTS|FOCUS MODE") { "Cyan" } elseif ($invLine3 -match "ACTIVE") { "Green" } elseif ($invLine3 -match "INACTIVE") { "Yellow" } else { "White" }
        
        Write-Host ($invLine1.PadRight($colWidth)) -NoNewline -ForegroundColor $invC1
        Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
        Write-Host ($invLine2.PadRight($colWidth)) -NoNewline -ForegroundColor $invC2
        Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
        Write-Host ($invLine3.PadRight($colWidth)) -NoNewline -ForegroundColor $invC3
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
    # Check if server was just restarted (within last 60 seconds) - don't restart again during cooldown
    $serverJustRestarted = $false
    if ($script:lastServerRestart -and $script:lastServerRestart -is [DateTime]) {
        try {
            $timeSinceServerRestart = (Get-Date) - $script:lastServerRestart
            if ($timeSinceServerRestart.TotalSeconds -lt 60) {
                $serverJustRestarted = $true
            }
        } catch {
            # If date arithmetic fails, assume server wasn't just restarted
            $serverJustRestarted = $false
        }
    }
    
    # If server was just restarted, check if it's actually running before trying to restart again
    if ($serverJustRestarted) {
        # Give the server time to start - check if it's actually running
        if (Test-ServerRunning) {
            # Server is running, no need to restart
            return $true
        } else {
            # Server was just restarted but not responding yet - wait a bit more
            # Don't kill processes yet, give it more time
            $cooldownMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server was just restarted (cooldown active) - waiting for it to become ready..."
            Write-ConsoleOutput -Message $cooldownMsg -ForegroundColor "Gray"
            return $false
        }
    }
    
    if (-not (Test-ServerRunning)) {
        # Don't write to console - update stats display instead
        # Write-Warning "Server is not running. Starting server..."
        try {
            # Step 0: Kill processes on port 3000 FIRST (before trying API or starting server)
            # This ensures port 3000 is free before we start the server
            Kill-Port3000Processes
            
            # Step 1: Try to stop all active simulations via API (if server is still running) - non-blocking
            try {
                $stopResultObj = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulations/stop-all" -Method POST -TimeoutSec 2 -JobTimeout 3
                if ($stopResultObj.Success) {
                    $stopResult = $stopResultObj.Content | ConvertFrom-Json
                } else {
                    throw $stopResultObj.Error
                }
                if ($stopResult.success -and $stopResult.stopped -gt 0) {
            # Don't write to console - update stats display instead
                    # Write-Info "Stopped $($stopResult.stopped) active simulation(s) before restart"
                }
            } catch {
                # Server might not be running - that's okay, we already killed processes
            }
            
            # Step 2: Verify port 3000 is free (Kill-Port3000Processes should have handled this, but double-check)
            Start-Sleep -Seconds 1  # Give processes time to fully terminate
            $portStillInUse = $false
            try {
                $portPattern = ':3000'
                $netstatOutput = netstat -ano | Select-String $portPattern
                if ($netstatOutput) {
                    # Check if any node processes are still using the port
                    foreach ($line in $netstatOutput) {
                        if ($line -match '\s+(\d+)\s*$') {
                            $processId = [int]$matches[1]
                            try {
                                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                                if ($process -and $process.ProcessName -eq 'node') {
                                    $portStillInUse = $true
                                    Write-Warning "Port 3000 still in use by node process (PID: $processId) - killing it..."
                                    Stop-Process -Id $processId -Force -ErrorAction Stop
                                }
                            } catch {
                                # Process might have already terminated
                            }
                        }
                    }
                }
            } catch {
                # If we can't check, assume it's free
            }
            
            if ($portStillInUse) {
                Start-Sleep -Seconds 2  # Wait a bit more if we had to kill something
            }
            
            # Step 3: Kill any remaining node processes BEFORE starting server (cleanup)
            $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
            if ($nodeProcesses) {
                $killNodeMsg = "[$(Get-Date -Format 'HH:mm:ss')] Killing $($nodeProcesses.Count) remaining node process(es) before starting server..."
                Write-ConsoleOutput -Message $killNodeMsg -ForegroundColor "Cyan"
                foreach ($proc in $nodeProcesses) {
                    try {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')]   Killing process: $($proc.ProcessName) (PID: $($proc.Id))" -ForegroundColor "Gray"
                        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                    } catch {
                        $procKillFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Failed to kill process $($proc.Id): $_"
                        Write-ConsoleOutput -Message $procKillFailMsg -ForegroundColor "Yellow"
                    }
                }
                Start-Sleep -Seconds 1  # Brief wait for processes to terminate
            }
            
            # Step 4: Start server in background (port 3000 should now be free, all node processes killed)
            $startServerMsg = "[$(Get-Date -Format 'HH:mm:ss')] Starting Node.js server..."
            Write-ConsoleOutput -Message $startServerMsg -ForegroundColor "Cyan"
            $serverProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start" -WindowStyle Minimized -PassThru
            $serverStartedMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server process started (PID: $($serverProcess.Id)). Waiting for server to be ready..."
            Write-ConsoleOutput -Message $serverStartedMsg -ForegroundColor "Cyan"
            
            # Wait up to 30 seconds for server to start - THIS BLOCKS UNTIL SERVER IS READY
            $maxWait = 30
            $waited = 0
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 1  # Check every 1 second instead of 2
                $waited += 1
                if (Test-ServerRunning) {
                    $serverReadyMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server is now online and ready!"
                    Write-ConsoleOutput -Message $serverReadyMsg -ForegroundColor "Green"
                    $script:lastServerRestart = Get-Date  # Track server restart time to prevent killing it too early
                    return $true
                }
                # Log progress every 5 seconds
                if ($waited % 5 -eq 0) {
                    $waitingMsg = "[$(Get-Date -Format 'HH:mm:ss')] Still waiting for server... ($waited / $maxWait seconds)"
                    Write-ConsoleOutput -Message $waitingMsg -ForegroundColor "Gray"
            }
            }
            $serverFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server failed to start within $maxWait seconds"
            Write-ConsoleOutput -Message $serverFailMsg -ForegroundColor "Red"
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
            # Check server health for active connections (non-blocking)
            try {
                $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                if ($healthResult.Success) {
                    $health = $healthResult.Content | ConvertFrom-Json
                    $isConnected = $health.onlinePlayers -gt 0
                } else {
                    $isConnected = $false
                }
            } catch {
                $isConnected = $false
            }
        }
        
        # On first check, if Unity is already running and connected, use it
        if ($isUnityRunning -and $isConnected -and -not $wasUnityRunning) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Detected existing Unity instance (PID: $($unityProcess.Id)) - using it" -ForegroundColor "Green"
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Already connected to server - no restart needed" -ForegroundColor "Green"
        }
        
        # Log Unity startup when process first appears
        if ($isUnityRunning -and -not $wasUnityRunning) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Game process started (PID: $($unityProcess.Id))" -ForegroundColor "Green"
        }
        
        # Log Unity connection when it first connects
        if ($isConnected -and -not $stats.UnityConnected) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connected to server!" -ForegroundColor "Green"
        }
        
        # Update stats
        $stats.UnityRunning = $isUnityRunning
        $stats.UnityConnected = $isConnected
        
        # Check if Unity was just started (give it grace period to connect)
        $unityJustStarted = $false
        if ($unityProcess) {
            try {
                $timeSinceUnityStart = (Get-Date) - $unityProcess.StartTime
                # Give Unity 45 seconds to start, enter play mode, initialize, connect, login
                # Unity needs time to: start process, load project, enter play mode, initialize, connect to server, login
                if ($timeSinceUnityStart.TotalSeconds -lt 45) {
                    $unityJustStarted = $true
                }
            } catch {
                # If we can't get start time, assume Unity wasn't just started
            }
        }
        
        # If Unity is not running, start it
        if (-not $unityProcess) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity not running, starting..." -ForegroundColor "Yellow"
            
            # Start Unity with project path and auto-mode
            $unityArgs = @(
                "-projectPath", $config.unity.projectPath
            )
            
            # Enable debug mode so debugger can attach
            $unityArgs += "-debugCodeOptimization"
            
            # Pass auto-mode to Unity (simulation or normal)
            if ($config.simulation.enabled) {
                $unityArgs += "-autoMode", "simulation"
                # Enable item ante if configured (check both boolean true and string "true")
                $itemAnteEnabled = $null
                $hasProperty = $false
                if ($config.simulation) {
                    $hasProperty = $config.simulation.PSObject.Properties['itemAnteEnabled'] -ne $null
                    if ($hasProperty) {
                        $itemAnteEnabled = $config.simulation.itemAnteEnabled
                    }
                }
                if ($itemAnteEnabled -eq $true -or $itemAnteEnabled -eq "true") {
                    $unityArgs += "-itemAnteEnabled", "true"
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Item ante enabled" -ForegroundColor "Cyan"
                }
                # Don't log when disabled - reduces console noise
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
            
            # Clean up Unity backup files before starting (async - don't wait for completion)
            # This prevents dialog prompts but doesn't block startup
            $unityTempPath = Join-Path $config.unity.projectPath "Temp"
            $recoveryPath = Join-Path $config.unity.projectPath "Assets\_Recovery"
            Start-Job -ScriptBlock {
                param($tempPath, $recPath)
                if (Test-Path $tempPath) {
                    Get-ChildItem -Path $tempPath -Filter "*Backup*" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
                    $backupScenesPath = Join-Path $tempPath "__Backupscenes"
                    if (Test-Path $backupScenesPath) {
                        Remove-Item -Path $backupScenesPath -Force -Recurse -ErrorAction SilentlyContinue
                    }
                }
                if (Test-Path $recPath) {
                    Get-ChildItem -Path $recPath -Filter "*Backup*" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
                }
            } -ArgumentList $unityTempPath, $recoveryPath | Out-Null
            
            # Start Unity in normal window (visible, not headless) with debugger support
            # Unity will automatically enter play mode via InitializeOnLoad
            Start-Process -FilePath $config.unity.executablePath -ArgumentList $unityArgs -WindowStyle Normal
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity started, will check connection status (45s grace period)" -ForegroundColor "Cyan"
            # Don't wait here - let the main loop check connection status with grace period
            return $true
        }
        # Unity is running but not connected - check if grace period has passed
        elseif (-not $isConnected -and -not $unityJustStarted) {
            # Unity is running but not connected, and grace period has passed
            # Check if there are recent connection attempts in logs
            $recentConnectionAttempt = $false
            try {
                $unityStatus = Get-UnityActualStatus
                if ($unityStatus.LastConnectionActivity -and $unityStatus.LastConnectionActivity -is [DateTime]) {
                    $now = Get-Date
                    $lastAttempt = $unityStatus.LastConnectionActivity
                    $timeSinceConnectionAttempt = $now - $lastAttempt
                    # Validate time is not negative (timezone issue) and not more than 1 hour in the future
                    if ($timeSinceConnectionAttempt.TotalSeconds -ge 0 -and $timeSinceConnectionAttempt.TotalSeconds -lt 3600) {
                        if ($timeSinceConnectionAttempt.TotalSeconds -lt 30) {
                            $recentConnectionAttempt = $true
                        }
                    }
                    # If time is negative or too far in future, ignore it (timezone issue)
                }
            } catch {
                # Can't check - assume no recent attempts
            }
            
            if (-not $recentConnectionAttempt) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Unity running but not connected (no recent connection attempts), restarting..." -ForegroundColor "Yellow"
                Stop-Process -Name "Unity" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                # Restart Unity (recursive call, but will hit the "not running" branch)
                return Restart-UnityIfNeeded
            } else {
                # Unity is trying to connect - wait a bit more
                return $true
            }
        }
        # Unity is running and connected (or still in grace period) - all good
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
    
    # AI-FIRST: Use AI decisions for all service management
    if ($script:aiIntegrationEnabled) {
        try {
            # Server management (AI decision)
            if ($config.automation.autoRestartServer) {
                $serverDecision = Should-AIStartServer
                if ($serverDecision -and $serverDecision.Should) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] AI DECISION: Starting server - $($serverDecision.Reason)" -ForegroundColor "Cyan"
                    Start-ServerIfNeeded | Out-Null
                }
            }
            
            # Unity management (AI decision)
            if ($config.automation.autoRestartUnity) {
                $unityDecision = Should-AIStartUnity
                if ($unityDecision -and $unityDecision.Should) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] AI DECISION: Starting Unity - $($unityDecision.Reason)" -ForegroundColor "Cyan"
                    Restart-UnityIfNeeded | Out-Null
                }
            }
            
            # Simulation management (AI decision)
            if ($config.simulation.enabled -and $config.simulation.autoStartSimulation) {
                $simDecision = Should-AIStartSimulation
                if ($simDecision -and $simDecision.Should) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] AI DECISION: Starting simulation - $($simDecision.Reason)" -ForegroundColor "Cyan"
                    # Start simulation via API (if not already running)
                    try {
                        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                        if ($healthResult.Success) {
                            $health = $healthResult.Content | ConvertFrom-Json
                            if ($health.activeSimulations -eq 0) {
                                # Start simulation via API
                                $simParams = @{
                                    tableName = $config.simulation.tableName
                                    maxPlayers = $config.simulation.maxPlayers
                                    startingChips = $config.simulation.startingChips
                                    smallBlind = $config.simulation.smallBlind
                                    bigBlind = $config.simulation.bigBlind
                                    itemAnteEnabled = if ($config.simulation.itemAnteEnabled) { $true } else { $false }
                                } | ConvertTo-Json
                                Invoke-WebRequestAsync -Uri "$serverUrl/api/simulation/create" -Method POST -Body $simParams -ContentType "application/json" -TimeoutSec 5 -JobTimeout 6 | Out-Null
                            }
                        }
                    } catch {
                        # Simulation start failed - log but continue
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [WARNING] Simulation start failed: $_" -ForegroundColor "Yellow"
                    }
                }
            }
            
            # Database management (still use legacy for now - AI decision can be added later)
            if ($config.automation.autoRestartDatabase) {
                Restart-DatabaseIfNeeded | Out-Null
            }
        } catch {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [ERROR] AI service management failed: $_" -ForegroundColor "Red"
            # Fallback to legacy if AI fails
            if ($config.automation.autoRestartServer) {
                Start-ServerIfNeeded | Out-Null
            }
            if ($config.automation.autoRestartUnity) {
                Restart-UnityIfNeeded | Out-Null
            }
            if ($config.automation.autoRestartDatabase) {
                Restart-DatabaseIfNeeded | Out-Null
            }
        }
    } else {
        # FALLBACK: Legacy service management (if AI integration disabled)
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
                # Check command line to see if it's running BrokenPromise.ps1
                $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
                
                if ($cmdLine -and $cmdLine -like "*BrokenPromise.ps1*") {
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
    # Step 0: Kill processes on port 3000 FIRST (before trying API or starting server)
    # This ensures port 3000 is free before we start the server
    Write-Info "Killing processes on port 3000..."
    Kill-Port3000Processes
    
    # Step 1: Try to stop all active simulations via API (if server is still running) - non-blocking
    Write-Info "Stopping all active simulations via API..."
    try {
        $stopResultObj = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulations/stop-all" -Method POST -TimeoutSec 5 -JobTimeout 6
        if ($stopResultObj.Success) {
            $stopResult = $stopResultObj.Content | ConvertFrom-Json
        } else {
            throw $stopResultObj.Error
        }
        if ($stopResult.success) {
            Write-Success "Stopped $($stopResult.stopped) active simulation(s)"
            if ($stopResult.failed -gt 0) {
                Write-Warning "Failed to stop $($stopResult.failed) simulation(s)"
            }
        }
    } catch {
        # Server might not be running or endpoint might not exist yet - that's okay, we already killed processes
        Write-Info "Could not stop simulations via API (server may not be running): $_"
    }
    
    # Step 2: Verify port 3000 is free (Kill-Port3000Processes should have handled this, but double-check)
    Start-Sleep -Seconds 1  # Give processes time to fully terminate
    $portStillInUse = $false
    try {
        $portPattern = ':3000'
        $netstatOutput = netstat -ano | Select-String $portPattern
        if ($netstatOutput) {
            # Check if any node processes are still using the port
            foreach ($line in $netstatOutput) {
                if ($line -match '\s+(\d+)\s*$') {
                    $processId = [int]$matches[1]
                    try {
                        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                        if ($process -and $process.ProcessName -eq 'node') {
                            $portStillInUse = $true
                            Write-Warning "Port 3000 still in use by node process (PID: $processId) - killing it..."
                            Stop-Process -Id $processId -Force -ErrorAction Stop
                        }
                    } catch {
                        # Process might have already terminated
                    }
                }
            }
        }
    } catch {
        # If we can't check, assume it's free
    }
    
    if ($portStillInUse) {
        Start-Sleep -Seconds 2  # Wait a bit more if we had to kill something
    }
    
    # Step 3: Kill any remaining node processes BEFORE starting server (cleanup - should be minimal after Kill-Port3000Processes)
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Info "Killing $($nodeProcesses.Count) remaining node process(es) before starting server..."
        foreach ($proc in $nodeProcesses) {
            try {
                Write-Info "  Killing process: $($proc.ProcessName) (PID: $($proc.Id))"
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
            } catch {
                Write-Warning "  Failed to kill process $($proc.Id): $_"
            }
        }
        Start-Sleep -Seconds 1  # Brief wait for processes to terminate
    }
    
    # Step 4: Start server in background (port 3000 should now be free, all node processes killed)
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
            $script:lastServerRestart = Get-Date  # Track server restart time to prevent killing it during startup
            break
        }
    }
    
    if (-not (Test-ServerRunning)) {
        Write-Warning "Server failed to start within $maxWait seconds"
    } else {
        # Even if we didn't break early, if server is running now, set the cooldown
        $script:lastServerRestart = Get-Date
    }
    } catch {
        Write-Error "Failed to restart server: $_"
    }

# Initial service maintenance check (quick check only - don't wait for slow operations)
# Check if services are already running first, skip maintenance if they are
$quickServerCheck = Test-ServerRunning
$quickUnityCheck = $false
$quickUnityConnected = $false
try {
    $unityProc = Get-Process -Name "Unity" -ErrorAction SilentlyContinue
    $quickUnityCheck = $null -ne $unityProc
    if ($quickUnityCheck -and $quickServerCheck) {
        # Check if Unity is already connected (non-blocking)
        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 1 -JobTimeout 2
        if ($healthResult.Success) {
            $health = $healthResult.Content | ConvertFrom-Json
            $quickUnityConnected = $health.onlinePlayers -gt 0
        }
    }
} catch {
    # Unity check failed - will do full maintenance
}

if (-not $quickServerCheck -or (-not $quickUnityCheck) -or (-not $quickUnityConnected)) {
    # Only do full maintenance if services aren't running or not connected
    Maintain-Services
} else {
    # Services are running and connected - just update stats, don't wait
    Write-Info "Services already running and connected - skipping initial maintenance"
}

# Clean up any stale fix-applied.json from previous session
if (Test-Path $fixAppliedFile) {
    Write-Info "Cleaning up stale fix-applied.json from previous session"
    Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
}

# Initialize monitor status file
Update-MonitorStatus -statusUpdate @{
    monitorStatus = "starting"
}

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
$script:lastServerRestart = $null  # Track when server was last restarted (to prevent restart loops)
$script:simulationStartTime = $null  # Track when we first detected a simulation starting (after monitor started)
$script:monitorStartTime = Get-Date  # Track when monitor started to ignore old simulations
$script:investigationCheckLogged = $false  # Track if we've logged the investigation check diagnostic message
$script:lastInvestigationStateLog = $null  # Track last investigation state log time
$script:investigationNullStartTimeLogged = $false  # Track if we've logged the null startTime warning (to avoid spam)
$script:lastFocusedGroupCheck = $null  # Track last time we checked for focused group without investigation
$script:lastInvestigationComplete = $null  # Track when last investigation completed (for cooldown)

while ($monitoringActive) {
    try {
        # NEW: Update monitor status using AI system (single source of truth)
        # AI system syncs its state to monitor-status.json
        if ($script:aiIntegrationEnabled) {
            try {
                if (-not $lastStatusUpdate) {
                    Update-AIMonitorStatus | Out-Null
                    $lastStatusUpdate = Get-Date
                } else {
                    try {
                        $timeSinceStatusUpdate = (Get-Date) - $lastStatusUpdate
                        if ($timeSinceStatusUpdate.TotalSeconds -ge 5) {
                            Update-AIMonitorStatus | Out-Null
                            $lastStatusUpdate = Get-Date
                        }
                    } catch {
                        Update-AIMonitorStatus | Out-Null
                        $lastStatusUpdate = Get-Date
                    }
                }
            } catch {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI status update failed: $_" -ForegroundColor "Yellow"
                # Fallback to legacy update
                Update-MonitorStatus
                $lastStatusUpdate = Get-Date
            }
        } else {
            # FALLBACK: Legacy status update (if AI integration not available)
            if (-not $lastStatusUpdate) {
                Update-MonitorStatus
                $lastStatusUpdate = Get-Date
            } else {
                try {
                    $timeSinceStatusUpdate = (Get-Date) - $lastStatusUpdate
                    if ($timeSinceStatusUpdate.TotalSeconds -ge 5) {
                        Update-MonitorStatus
                        $lastStatusUpdate = Get-Date
                    }
                } catch {
                    Update-MonitorStatus
                    $lastStatusUpdate = Get-Date
                }
            }
        }
        
        # Periodic service maintenance (every 30 seconds)
        $timeSinceServiceCheck = (Get-Date) - $lastServiceCheck
        if ($timeSinceServiceCheck.TotalSeconds -ge $serviceCheckInterval) {
            Maintain-Services
            $lastServiceCheck = Get-Date
        }
        
        # NEW: Use AI system to check pause/resume decisions (every 5 seconds)
        if ($script:aiIntegrationEnabled) {
            try {
                # Check if Unity should be paused
                if (-not $isPaused) {
                    $pauseDecision = Should-AIPauseUnity
                    if ($pauseDecision -and $pauseDecision.Should) {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] AI DECISION: Pausing Unity - $($pauseDecision.Reason)" -ForegroundColor "Cyan"
                        # Pause Unity via API
                        $activeIssues = Get-AIActiveIssues
                        $tableId = if ($activeIssues -and $activeIssues.Issues -and $activeIssues.Issues.Count -gt 0 -and $activeIssues.Issues[0].details -and $activeIssues.Issues[0].details.tableId) {
                            $activeIssues.Issues[0].details.tableId
                        } else { $null }
                        Invoke-PauseUnity -tableId $tableId -reason $pauseDecision.Reason | Out-Null
                        $isPaused = $true
                        Update-AIMonitorStatus | Out-Null
                    }
                }
                
                # Check if Unity should be resumed
                if ($isPaused) {
                    $resumeDecision = Should-AIResumeUnity
                    if ($resumeDecision -and $resumeDecision.Should) {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] AI DECISION: Resuming Unity - $($resumeDecision.Reason)" -ForegroundColor "Green"
                        # Resume Unity via API
                        try {
                            Invoke-WebRequestAsync -Uri "$serverUrl/api/simulation/resume" -Method POST -TimeoutSec 2 -JobTimeout 3 | Out-Null
                            $isPaused = $false
                            Update-AIMonitorStatus | Out-Null
                        } catch {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [WARNING] Resume Unity failed: $_" -ForegroundColor "Yellow"
                        }
                    }
                }
            } catch {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI pause/resume check failed: $_" -ForegroundColor "Yellow"
            }
        }
        
        # NEW: Use AI system to decide if investigation should start
        # AI makes the decision based on complete information
        if ($script:aiIntegrationEnabled) {
            try {
                $aiDecision = Should-AIStartInvestigation
                if ($aiDecision -and $aiDecision.Should) {
                    $startResult = Start-AIInvestigation
                    if ($startResult -and $startResult.Success) {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: AI started investigation - $($aiDecision.Reason)" -ForegroundColor "Cyan"
                        # Sync local variables from AI state
                        $aiStatus = Get-AIInvestigationStatus
                        if ($aiStatus) {
                            $script:isInvestigating = $aiStatus.Active
                            $script:investigationStartTime = $aiStatus.StartTime
                        }
                        # Update status file
                        Update-AIMonitorStatus | Out-Null
                    }
                }
            } catch {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI investigation check failed: $_" -ForegroundColor "Yellow"
            }
        } else {
            # FALLBACK: Legacy investigation start logic (if AI integration not available)
            # CRITICAL: Check for existing focused group FIRST (before investigation check)
            if (-not $script:lastFocusedGroupCheck) {
                $script:lastFocusedGroupCheck = Get-Date
            }
            $timeSinceLastCheck = ((Get-Date) - $script:lastFocusedGroupCheck).TotalSeconds
            
            if (-not $script:isInvestigating -and $timeSinceLastCheck -ge 5) {
                $pendingInfo = Get-PendingIssuesInfo
                if ($pendingInfo -and $pendingInfo.InFocusMode -and $pendingInfo.RootIssue -and $investigationEnabled -and $investigationTimeout -gt 0) {
                    $script:isInvestigating = $true
                    $script:investigationStartTime = Get-Date
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Starting (legacy mode) - $($pendingInfo.RootIssue.type)" -ForegroundColor "Cyan"
                    Update-MonitorStatus
                    $lastStatusUpdate = Get-Date
                }
                $script:lastFocusedGroupCheck = Get-Date
            }
        }
        
        # NEW: Use AI system to check investigation status and complete if needed
        # AI manages investigation state - single source of truth
        if ($script:aiIntegrationEnabled) {
            try {
                $aiStatus = Get-AIInvestigationStatus
                if ($aiStatus -and $aiStatus.Active) {
                    # Sync local variables from AI state
                    $script:isInvestigating = $true
                    $script:investigationStartTime = $aiStatus.StartTime
                    
                    # Check if investigation should complete (timeout reached)
                    if ($aiStatus.TimeRemaining -ne $null -and $aiStatus.TimeRemaining -le 0) {
                        # Investigation complete - use AI to complete it
                        $completeResult = Complete-AIInvestigation
                        if ($completeResult -and $completeResult.Success) {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION COMPLETE: AI completed investigation" -ForegroundColor "Yellow"
                            
                            # Get active issues for pause decision
                            $activeIssues = Get-AIActiveIssues
                            if ($activeIssues -and $activeIssues.Count -gt 0) {
                                # Check if Unity should be paused
                                $pauseDecision = Should-AIPauseUnity
                                if ($pauseDecision -and $pauseDecision.Should) {
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION COMPLETE: $($activeIssues.Count) issue(s) found - pausing Unity" -ForegroundColor "Cyan"
                                    Write-ConsoleOutput -Message "  >>> ACTION REQUIRED: Ask the AI to analyze this investigation <<<" -ForegroundColor "Cyan"
                                    # Pause Unity via API (non-blocking)
                                    $tableId = if ($activeIssues.Issues -and $activeIssues.Issues.Count -gt 0 -and $activeIssues.Issues[0].details -and $activeIssues.Issues[0].details.tableId) {
                                        $activeIssues.Issues[0].details.tableId
                                    } else { $null }
                                    if ($tableId) {
                                        Invoke-WebRequestAsync -Uri "$serverUrl/api/simulation/pause" -Method POST -Body (@{ tableId = $tableId } | ConvertTo-Json) -ContentType "application/json" | Out-Null
                                    } else {
                                        Invoke-WebRequestAsync -Uri "$serverUrl/api/simulation/pause" -Method POST | Out-Null
                                    }
                                    $isPaused = $true
                                }
                            }
                            
                            # Reset local variables
                            $script:isInvestigating = $false
                            $script:investigationStartTime = $null
                            
                            # Update status
                            Update-AIMonitorStatus | Out-Null
                        }
                    }
                } else {
                    # Investigation not active - sync local variables
                    $script:isInvestigating = $false
                    $script:investigationStartTime = $null
                }
            } catch {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI investigation status check failed: $_" -ForegroundColor "Yellow"
            }
        } else {
            # FALLBACK: Legacy investigation completion logic (if AI integration not available)
            # Check if investigation phase is complete
            # IMPORTANT: This check runs every loop iteration to ensure investigation completes on time
            # SELF-DIAGNOSTIC: Monitor must be able to diagnose its own problems
        
        # ALWAYS log investigation state (every 10 seconds) to diagnose why check isn't running
        if (-not $script:lastInvestigationStateLog -or ((Get-Date) - $script:lastInvestigationStateLog).TotalSeconds -ge 10) {
            try {
                $startTimeType = if ($script:investigationStartTime) { 
                    try { $script:investigationStartTime.GetType().Name } catch { "unknown" }
                } else { "null" }
                $startTimeValue = if ($script:investigationStartTime) { 
                    try { $script:investigationStartTime.ToString() } catch { "error" }
                } else { "null" }
                $stateMsg = "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation state: isInvestigating=$($script:isInvestigating), startTime=$startTimeValue, type=$startTimeType"
                Write-ConsoleOutput -Message $stateMsg -ForegroundColor "Gray"
                $script:lastInvestigationStateLog = Get-Date
            } catch {
                # Don't let diagnostic logging crash the monitor
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Error logging investigation state: $_" -ForegroundColor "Yellow"
                $script:lastInvestigationStateLog = Get-Date
            }
        }
        
        # CRITICAL FIX: Check investigation state more robustly
        # ALWAYS check status file FIRST to ensure we have the truth
        $statusFileInvestigationActive = $false
        $statusFileInvestigationStartTime = $null
        $statusFileTimeRemaining = $null
        $statusFileReadSuccess = $false
        try {
            $statusFilePath = Join-Path $script:projectRoot "logs\monitor-status.json"
            if (Test-Path $statusFilePath) {
                $statusData = Get-Content $statusFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                # CRITICAL FIX: Check investigation.active more robustly - it might be a string "True" or boolean true
                if ($statusData.investigation) {
                    $activeValue = $statusData.investigation.active
                    # Convert to bool if it's a string, or use as-is if it's already a bool
                    if ($activeValue -is [bool]) {
                        $statusFileInvestigationActive = $activeValue
                    } elseif ($activeValue -is [string]) {
                        $statusFileInvestigationActive = ($activeValue -eq "True" -or $activeValue -eq "true" -or $activeValue -eq "1")
                    } else {
                        $statusFileInvestigationActive = [bool]$activeValue
                    }
                    if ($statusData.investigation.startTime) {
                        try {
                            $statusFileInvestigationStartTime = [DateTime]::Parse($statusData.investigation.startTime)
                        } catch {
                            # Invalid date - ignore
                        }
                    }
                    if ($statusData.investigation.timeRemaining -ne $null) {
                        $statusFileTimeRemaining = $statusData.investigation.timeRemaining
                    }
                    $statusFileReadSuccess = $true
                }
            }
        } catch {
            # Status file read failed - log error but continue with script variables
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Failed to read status file: $_" -ForegroundColor "Red"
            $statusFileReadSuccess = $false
        }
        
        # DIAGNOSTIC: Always log what we read from status file (or that read failed)
        if ($statusFileReadSuccess) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Status file read: active=$statusFileInvestigationActive, timeRemaining=$statusFileTimeRemaining, startTime=$statusFileInvestigationStartTime" -ForegroundColor "Gray"
        } else {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Status file read: FAILED - using script variables only" -ForegroundColor "Yellow"
        }
        
        # CRITICAL: If status file shows investigation active, ALWAYS sync script variables
        # This ensures script variables match the status file (source of truth)
        if ($statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
            # Sync script variables to match status file
            if (-not $script:isInvestigating) {
                $script:isInvestigating = $true
            }
            if (-not $script:investigationStartTime -or $script:investigationStartTime -ne $statusFileInvestigationStartTime) {
                $script:investigationStartTime = $statusFileInvestigationStartTime
            }
        }
        
        # CRITICAL: Validate and sync script variables from status file
        # This ensures script variables are always in sync with status file (source of truth)
        if ($script:isInvestigating) {
            # Investigation flag is true - validate startTime
            if ($script:investigationStartTime) {
                if ($script:investigationStartTime -isnot [DateTime]) {
                    # StartTime exists but is wrong type - log and reset
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] ERROR: investigationStartTime is not DateTime (type: $($script:investigationStartTime.GetType().Name)) - resetting investigation" -ForegroundColor "Red"
                    $script:isInvestigating = $false
                    $script:investigationStartTime = $null
                    $script:investigationCheckLogged = $false
                    $script:investigationNullStartTimeLogged = $false
                    # Force status update to clear invalid state
                    Update-MonitorStatus
                    $lastStatusUpdate = Get-Date
                } else {
                    # Reset the null startTime warning flag if it was set
                    $script:investigationNullStartTimeLogged = $false
                }
            } else {
                # Investigation flag is true but startTime is null
                # CRITICAL: If status file shows active but script has no startTime, sync from status file
                if ($statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Syncing investigation startTime from status file" -ForegroundColor "Cyan"
                    $script:investigationStartTime = $statusFileInvestigationStartTime
                } elseif (-not $script:investigationNullStartTimeLogged) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] WARNING: isInvestigating=true but investigationStartTime is null - resetting stuck investigation" -ForegroundColor "Yellow"
                    $script:investigationNullStartTimeLogged = $true
                    # Reset immediately - investigation is stuck
                    $script:isInvestigating = $false
                    $script:investigationStartTime = $null
                    $script:investigationCheckLogged = $false
                    # Force status update to clear stuck state
                    Update-MonitorStatus
                    $lastStatusUpdate = Get-Date
                }
            }
        } elseif ($statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
            # Script says not investigating but status file says it is - sync from status file
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Syncing investigation state from status file (script was out of sync)" -ForegroundColor "Cyan"
            $script:isInvestigating = $true
            $script:investigationStartTime = $statusFileInvestigationStartTime
            $script:investigationCheckLogged = $false
            $script:investigationNullStartTimeLogged = $false
        }
        
        # CRITICAL: Investigation completion check - use SCRIPT VARIABLES as PRIMARY source of truth
        # Status file is for external tools, but script variables are the real state
        # ALWAYS check script variables FIRST - don't depend on status file read success
        # This ensures completion check runs even if status file read fails
        $investigationIsActive = $false
        $investigationStartTimeToUse = $null
        
        # PRIMARY: Check script variables first (most reliable)
        if ($script:isInvestigating -and $script:investigationStartTime -and $script:investigationStartTime -is [DateTime]) {
            $investigationIsActive = $true
            $investigationStartTimeToUse = $script:investigationStartTime
        }
        # FALLBACK: If script variables not set but status file says active, use status file
        elseif ($statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
            $investigationIsActive = $true
            $investigationStartTimeToUse = $statusFileInvestigationStartTime
            # Sync script variables from status file
            if (-not $script:isInvestigating) {
                $script:isInvestigating = $true
            }
            if (-not $script:investigationStartTime -or $script:investigationStartTime -ne $statusFileInvestigationStartTime) {
                $script:investigationStartTime = $statusFileInvestigationStartTime
            }
        }
        # FALLBACK: If script says investigating but no startTime, try to get from status file
        elseif ($script:isInvestigating -and -not $script:investigationStartTime -and $statusFileInvestigationStartTime) {
            $investigationIsActive = $true
            $investigationStartTimeToUse = $statusFileInvestigationStartTime
            $script:investigationStartTime = $statusFileInvestigationStartTime
        }
        
        # CRITICAL: Always run completion check if we have ANY indication of active investigation
        # This ensures we complete even if status file read failed
        # DIAGNOSTIC: Log why completion check might not run
        if (-not $investigationIsActive) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Completion check SKIPPED: investigationIsActive=$investigationIsActive (script:isInvestigating=$($script:isInvestigating), script:startTime=$($script:investigationStartTime), statusFileActive=$statusFileInvestigationActive, statusFileStartTime=$statusFileInvestigationStartTime)" -ForegroundColor "Yellow"
        } elseif (-not $investigationStartTimeToUse) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Completion check SKIPPED: investigationStartTimeToUse is null (investigationIsActive=$investigationIsActive, script:startTime=$($script:investigationStartTime), statusFileStartTime=$statusFileInvestigationStartTime)" -ForegroundColor "Yellow"
        }
        
        # CRITICAL FIX: If status file shows investigation active but we don't have startTime, try to get it from status file directly
        if (-not $investigationIsActive -and $statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Status file shows active investigation but script variables not set - syncing and forcing completion check" -ForegroundColor "Cyan"
            $investigationIsActive = $true
            $investigationStartTimeToUse = $statusFileInvestigationStartTime
            # Sync script variables
            $script:isInvestigating = $true
            $script:investigationStartTime = $statusFileInvestigationStartTime
        }
        
        # CRITICAL SAFETY CHECK: If status file shows investigation active for too long, force completion check
        # This prevents investigations from getting stuck when the normal check isn't running
        # CRITICAL: Also check if timeRemaining is 0 or negative - this is a direct indicator it should complete
        # CRITICAL: ALWAYS re-read status file directly EVERY loop iteration to catch stuck investigations
        # This ensures we catch investigations that started but weren't detected by the initial read
        $statusFileDirectRead = $null
        $statusFileDirectActive = $false
        $statusFileDirectStartTime = $null
        $statusFileDirectTimeRemaining = $null
        try {
            $statusFilePath = Join-Path $script:projectRoot "logs\monitor-status.json"
            if (Test-Path $statusFilePath) {
                $statusFileDirectRead = Get-Content $statusFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                if ($statusFileDirectRead.investigation) {
                    $activeValue = $statusFileDirectRead.investigation.active
                    if ($activeValue -is [bool]) {
                        $statusFileDirectActive = $activeValue
                    } elseif ($activeValue -is [string]) {
                        $statusFileDirectActive = ($activeValue -eq "True" -or $activeValue -eq "true" -or $activeValue -eq "1")
                    } else {
                        $statusFileDirectActive = [bool]$activeValue
                    }
                    if ($statusFileDirectRead.investigation.startTime) {
                        try {
                            $statusFileDirectStartTime = [DateTime]::Parse($statusFileDirectRead.investigation.startTime)
                        } catch {
                            # Invalid date - ignore
                        }
                    }
                    if ($statusFileDirectRead.investigation.timeRemaining -ne $null) {
                        $statusFileDirectTimeRemaining = $statusFileDirectRead.investigation.timeRemaining
                    }
                }
            }
        } catch {
            # Direct read failed - use values from initial read
            $statusFileDirectActive = $statusFileInvestigationActive
            $statusFileDirectStartTime = $statusFileInvestigationStartTime
            $statusFileDirectTimeRemaining = $statusFileTimeRemaining
        }
        
        # Use direct read values if they're more recent/accurate
        # CRITICAL: Always prefer direct read if it shows active investigation (more accurate)
        # CRITICAL: If direct read found active investigation, ALWAYS use it (even if initial read said inactive)
        if ($statusFileDirectActive -or $statusFileDirectStartTime) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Direct status file read: active=$statusFileDirectActive, startTime=$statusFileDirectStartTime, timeRemaining=$statusFileDirectTimeRemaining" -ForegroundColor "Gray"
            # CRITICAL: If direct read shows active, use it (even if initial read said false)
            if ($statusFileDirectActive) {
                $statusFileInvestigationActive = $statusFileDirectActive
            }
            if ($statusFileDirectStartTime) {
                $statusFileInvestigationStartTime = $statusFileDirectStartTime
            }
            if ($statusFileDirectTimeRemaining -ne $null) {
                $statusFileTimeRemaining = $statusFileDirectTimeRemaining
            }
        }
        
        # CRITICAL: Forced completion check - ALWAYS run EVERY loop iteration
        # This ensures we catch stuck investigations even if initial read failed or is stale
        # CRITICAL: Always use direct read values (most recent) - they're the most recent
        # DIAGNOSTIC: Log what we found
        if ($statusFileDirectActive -or $statusFileDirectStartTime) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Forced completion check: directReadActive=$statusFileDirectActive, directReadStartTime=$statusFileDirectStartTime, directReadTimeRemaining=$statusFileDirectTimeRemaining" -ForegroundColor "Gray"
        }
        
        # CRITICAL: Use direct read values if available (they're more recent)
        # If direct read found active investigation, use those values for forced completion check
        # CRITICAL: Always check direct read FIRST, then fall back to initial read
        # CRITICAL: Also check status file directly if both reads failed but status file exists
        $forcedCheckActive = $false
        $forcedCheckStartTime = $null
        $forcedCheckTimeRemaining = $null
        
        if ($statusFileDirectActive -and $statusFileDirectStartTime) {
            # Direct read found active investigation - use these values (most recent)
            $forcedCheckActive = $statusFileDirectActive
            $forcedCheckStartTime = $statusFileDirectStartTime
            $forcedCheckTimeRemaining = $statusFileDirectTimeRemaining
        } elseif ($statusFileInvestigationActive -and $statusFileInvestigationStartTime) {
            # Fall back to initial read values
            $forcedCheckActive = $statusFileInvestigationActive
            $forcedCheckStartTime = $statusFileInvestigationStartTime
            $forcedCheckTimeRemaining = $statusFileTimeRemaining
        } elseif ($statusFileDirectReadSuccess -and $statusFileDirectRead -and $statusFileDirectRead.investigation) {
            # CRITICAL: If direct read succeeded but didn't set variables, try to parse directly
            # This handles edge cases where parsing failed silently
            try {
                $inv = $statusFileDirectRead.investigation
                if ($inv.active) {
                    $activeVal = $inv.active
                    if ($activeVal -is [bool] -and $activeVal) {
                        $forcedCheckActive = $true
                    } elseif ($activeVal -is [string] -and ($activeVal -eq "True" -or $activeVal -eq "true" -or $activeVal -eq "1")) {
                        $forcedCheckActive = $true
                    } elseif ([bool]$activeVal) {
                        $forcedCheckActive = $true
                    }
                    if ($inv.startTime) {
                        try {
                            $forcedCheckStartTime = [DateTime]::Parse($inv.startTime)
                        } catch {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Failed to parse startTime in fallback: $($inv.startTime)" -ForegroundColor "Yellow"
                        }
                    }
                    if ($inv.timeRemaining -ne $null) {
                        $forcedCheckTimeRemaining = $inv.timeRemaining
                    }
                }
            } catch {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Fallback forced check parse failed: $_" -ForegroundColor "Yellow"
            }
        }
        
        # CRITICAL: ALWAYS check forced completion if we found ANY active investigation
        # This ensures we catch stuck investigations even if the main completion check is skipped
        if ($forcedCheckActive -and $forcedCheckStartTime) {
            $timeoutValue = if ($investigationTimeout) { $investigationTimeout } else { 15 }
            $elapsedFromStatusFile = ((Get-Date) - $forcedCheckStartTime).TotalSeconds
            $shouldForceCompletion = $false
            $forceReason = ""
            
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Forced completion evaluation: elapsed=$([Math]::Round($elapsedFromStatusFile, 1))s, timeout=$timeoutValue s, timeRemaining=$forcedCheckTimeRemaining" -ForegroundColor "Gray"
            
            # CRITICAL: Check elapsed time FIRST - this is the primary indicator
            # If elapsed >= timeout, investigation should complete regardless of timeRemaining
            if ($elapsedFromStatusFile -ge $timeoutValue) {
                $shouldForceCompletion = $true
                $forceReason = "elapsed=$([Math]::Round($elapsedFromStatusFile, 1))s >= timeout=$timeoutValue s"
            }
            # Force if timeRemaining is 0 or negative (direct indicator)
            elseif ($forcedCheckTimeRemaining -ne $null -and $forcedCheckTimeRemaining -le 0) {
                $shouldForceCompletion = $true
                $forceReason = "timeRemaining=$forcedCheckTimeRemaining <= 0"
            }
            
            if ($shouldForceCompletion) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] FORCED COMPLETION CHECK: Status file shows investigation active ($forceReason) - FORCING COMPLETION CHECK" -ForegroundColor "Red"
                # Force investigation to be active so completion check runs
                $investigationIsActive = $true
                $investigationStartTimeToUse = $forcedCheckStartTime
                # Sync script variables from direct read (most recent)
                $script:isInvestigating = $true
                $script:investigationStartTime = $forcedCheckStartTime
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Forced completion check: NOT triggering (elapsed=$([Math]::Round($elapsedFromStatusFile, 1))s, timeout=$timeoutValue s, timeRemaining=$forcedCheckTimeRemaining)" -ForegroundColor "Gray"
            }
        } else {
            # CRITICAL: Even if we didn't find an active investigation, log why for diagnostics
            # This helps identify when the direct read is failing or not finding active investigations
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Forced completion check: SKIPPED (no active investigation found - initialReadActive=$statusFileInvestigationActive, initialReadStartTime=$statusFileInvestigationStartTime, directReadActive=$statusFileDirectActive, directReadStartTime=$statusFileDirectStartTime)" -ForegroundColor "Gray"
        }
        
        if ($investigationIsActive -and $investigationStartTimeToUse) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Investigation completion check: scriptActive=$($script:isInvestigating), statusFileActive=$statusFileInvestigationActive, startTime=$($investigationStartTimeToUse.ToString('HH:mm:ss')), statusFileReadSuccess=$statusFileReadSuccess" -ForegroundColor "Gray"
            
            $timeoutValue = if ($investigationTimeout) { $investigationTimeout } else { 15 }
            $shouldCompleteNow = $false
            $completionReason = ""
            
            # CRITICAL: Calculate elapsed time FIRST (primary check - always works)
            # This is the most reliable way to determine if investigation should complete
            $elapsedFromStartTime = ((Get-Date) - $investigationStartTimeToUse).TotalSeconds
            $elapsedCheckResult = $elapsedFromStartTime -ge ($timeoutValue - 1)
            
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] elapsed check: $([Math]::Round($elapsedFromStartTime, 1))s >= ($timeoutValue - 1) = $elapsedCheckResult" -ForegroundColor "Gray"
            
            # Check timeRemaining from status file as secondary indicator (if available)
            if ($statusFileReadSuccess -and $statusFileTimeRemaining -ne $null) {
                if ($statusFileTimeRemaining -le 0) {
                    $shouldCompleteNow = $true
                    $completionReason = "timeRemaining=$statusFileTimeRemaining <= 0"
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] timeRemaining check: $statusFileTimeRemaining <= 0 = TRUE - should complete" -ForegroundColor "Yellow"
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] timeRemaining check: $statusFileTimeRemaining <= 0 = FALSE" -ForegroundColor "Gray"
                }
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] timeRemaining check: SKIPPED (statusFileReadSuccess=$statusFileReadSuccess, timeRemaining=$statusFileTimeRemaining)" -ForegroundColor "Gray"
            }
            
            # CRITICAL: Elapsed time check is PRIMARY - always use this
            # This ensures we complete even if status file read failed or is stale
            if ($elapsedCheckResult) {
                $shouldCompleteNow = $true  # CRITICAL: Always set to true if elapsed check passes
                if ([string]::IsNullOrEmpty($completionReason)) {
                    $completionReason = "elapsed=$([Math]::Round($elapsedFromStartTime, 1))s >= timeout=$timeoutValue s"
                }
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] elapsed check: TRUE - should complete (elapsed=$([Math]::Round($elapsedFromStartTime, 1))s, timeout=$timeoutValue s)" -ForegroundColor "Yellow"
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] elapsed check: FALSE - not yet (elapsed=$([Math]::Round($elapsedFromStartTime, 1))s, timeout=$timeoutValue s)" -ForegroundColor "Gray"
            }
            
            # SAFETY CHECK: Force completion if investigation has been running way too long (2x timeout)
            # This prevents investigations from getting stuck indefinitely
            if (-not $shouldCompleteNow -and $elapsedFromStartTime -ge ($timeoutValue * 2)) {
                $shouldCompleteNow = $true
                $completionReason = "SAFETY: elapsed=$([Math]::Round($elapsedFromStartTime, 1))s >= 2x timeout=$($timeoutValue * 2)s"
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] INVESTIGATION STUCK - FORCING COMPLETION (elapsed=$([Math]::Round($elapsedFromStartTime, 1))s >= 2x timeout=$($timeoutValue * 2)s)" -ForegroundColor "Red"
            }
            
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] shouldCompleteNow=$shouldCompleteNow, reason=$completionReason" -ForegroundColor $(if ($shouldCompleteNow) { "Yellow" } else { "Gray" })
            
            if ($shouldCompleteNow) {
                # Investigation should have completed - complete IMMEDIATELY
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation MUST complete NOW ($completionReason)" -ForegroundColor "Yellow"
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] ENTERING COMPLETION BLOCK - resetting investigation state" -ForegroundColor "Cyan"
                
                # Complete investigation immediately
                $script:isInvestigating = $false
                $script:investigationStartTime = $null
                $script:investigationCheckLogged = $false
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Investigation state reset: isInvestigating=$($script:isInvestigating), startTime=$($script:investigationStartTime)" -ForegroundColor "Cyan"
                
                $pendingInfo = Get-PendingIssuesInfo
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Got pending info: InFocusMode=$($pendingInfo.InFocusMode), hasRootIssue=$($null -ne $pendingInfo.RootIssue)" -ForegroundColor "Cyan"
                
                # CRITICAL FIX: If Get-PendingIssuesInfo returns false but file has focusedGroup, read file directly
                # This handles cases where Get-PendingIssuesInfo fails due to timing/parsing issues
                if (-not $pendingInfo -or -not $pendingInfo.InFocusMode -or -not $pendingInfo.RootIssue) {
                    try {
                        if (Test-Path $pendingIssuesFile) {
                            $pendingContent = Get-Content $pendingIssuesFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                            if ($pendingContent.focusedGroup -and $pendingContent.focusedGroup.rootIssue) {
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Get-PendingIssuesInfo returned false but file has focusedGroup - using file data directly" -ForegroundColor "Yellow"
                                $pendingInfo = @{
                                    InFocusMode = $true
                                    RootIssue = $pendingContent.focusedGroup.rootIssue
                                    RelatedIssuesCount = if ($pendingContent.focusedGroup.relatedIssues) { $pendingContent.focusedGroup.relatedIssues.Count } else { 0 }
                                    RelatedIssues = if ($pendingContent.focusedGroup.relatedIssues) { $pendingContent.focusedGroup.relatedIssues } else { @() }
                                    GroupId = $pendingContent.focusedGroup.id
                                }
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Fixed pending info: InFocusMode=$($pendingInfo.InFocusMode), hasRootIssue=$($null -ne $pendingInfo.RootIssue)" -ForegroundColor "Cyan"
                            }
                        }
                    } catch {
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Failed to read pending-issues.json directly: $_" -ForegroundColor "Yellow"
                    }
                }
                
                if ($pendingInfo -and $pendingInfo.InFocusMode -and $pendingInfo.RootIssue) {
                    $rootIssue = $pendingInfo.RootIssue
                    $relatedCount = $pendingInfo.RelatedIssuesCount
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION COMPLETE: Pausing debugger" -ForegroundColor "Yellow"
                    Write-ConsoleOutput -Message "  Root Issue: $($rootIssue.type) ($($rootIssue.severity))" -ForegroundColor "White"
                    if ($relatedCount -gt 0) {
                        Write-ConsoleOutput -Message "  Related Issues Found: $relatedCount" -ForegroundColor "Cyan"
                    }
                    Write-ConsoleOutput -Message "" -ForegroundColor "White"
                    Write-ConsoleOutput -Message "  >>> ACTION REQUIRED: Ask the AI to analyze this investigation <<<" -ForegroundColor "Cyan"
                    Write-ConsoleOutput -Message "  The AI will use patterns, fix attempts, and investigation data to propose a fix" -ForegroundColor "White"
                    Write-ConsoleOutput -Message "  Investigation data is in: logs\pending-issues.json" -ForegroundColor "Gray"
                    Write-ConsoleOutput -Message "" -ForegroundColor "White"
                    $tableId = if ($rootIssue.tableId) { $rootIssue.tableId } else { $null }
                    if (-not $isPaused -and $config.unity.pauseDebuggerOnIssue) {
                        # CRITICAL FIX: Use /api/simulation/pause instead of /api/debugger/break for more reliable pausing
                        # This sets table.isPaused=true and broadcasts state, which Unity reads via table_state event
                        # CRITICAL: Add timeout protection to prevent blocking the loop
                        try {
                            # Get the table from server first (with timeout protection)
                            $serverHealth = $null
                            $tables = $null
                            $targetTable = $null
                            
                            # Use job with timeout to prevent blocking
                            $healthJob = Start-Job -ScriptBlock { param($url) try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -ErrorAction Stop; return @{ Success = $true; Content = $response.Content } } catch { return @{ Success = $false; Error = $_.Exception.Message } } } -ArgumentList "$serverUrl/health"
                            $healthResult = $healthJob | Wait-Job -Timeout 3 | Receive-Job
                            $healthJob | Remove-Job -ErrorAction SilentlyContinue
                            
                            if ($healthResult -and $healthResult.Success) {
                                $serverHealth = $healthResult.Content | ConvertFrom-Json
                                if ($serverHealth.activeSimulations -gt 0) {
                                    # Get tables with timeout protection
                                    $tablesJob = Start-Job -ScriptBlock { param($url) try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -ErrorAction Stop; return @{ Success = $true; Content = $response.Content } } catch { return @{ Success = $false; Error = $_.Exception.Message } } } -ArgumentList "$serverUrl/api/tables"
                                    $tablesResult = $tablesJob | Wait-Job -Timeout 3 | Receive-Job
                                    $tablesJob | Remove-Job -ErrorAction SilentlyContinue
                                    
                                    if ($tablesResult -and $tablesResult.Success) {
                                        $tables = $tablesResult.Content | ConvertFrom-Json
                                        $targetTable = $tables | Where-Object { $_.id -eq $tableId -or ($null -eq $tableId -and $_.isSimulation -eq $true) } | Select-Object -First 1
                                        
                                        if ($targetTable) {
                                            # Call the server API to pause the simulation table (with timeout protection)
                                            $pauseBody = @{
                                                tableId = $targetTable.id
                                                reason = "$($rootIssue.type) - $($rootIssue.severity) severity (Investigation complete)"
                                            } | ConvertTo-Json
                                            $pauseJob = Start-Job -ScriptBlock { param($url, $body) try { Invoke-WebRequest -Uri $url -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null; return @{ Success = $true } } catch { return @{ Success = $false; Error = $_.Exception.Message } } } -ArgumentList "$serverUrl/api/simulation/pause", $pauseBody
                                            $pauseResult = $pauseJob | Wait-Job -Timeout 6 | Receive-Job
                                            $pauseJob | Remove-Job -ErrorAction SilentlyContinue
                                            
                                            if ($pauseSuccess) {
                                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Paused via table state update for table $($targetTable.id)" -ForegroundColor "Green"
                                                $isPaused = $true
                                            } else {
                                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to pause Unity via API" -ForegroundColor "Yellow"
                                                $pauseSuccess = $false
                                            }
                                        } else {
                                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Could not find target simulation table to pause." -ForegroundColor "Yellow"
                                            $pauseSuccess = $false
                                        }
                                    } else {
                                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to get tables from server: $($tablesResult.Error)" -ForegroundColor "Yellow"
                                        $pauseSuccess = $false
                                    }
                                } else {
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: No active simulations found to pause." -ForegroundColor "Yellow"
                                    $pauseSuccess = $false
                                }
                            } else {
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to get server health: $($healthResult.Error)" -ForegroundColor "Yellow"
                                $pauseSuccess = $false
                            }
                        } catch {
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ERROR: Failed to pause Unity via table state: $_" -ForegroundColor "Red"
                            $pauseSuccess = $false
                            # Fallback: Try pause again with tableId
                            try {
                                $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason "$($rootIssue.type) - $($rootIssue.severity) severity (Investigation complete)"
                            } catch {
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ERROR: Fallback pause method also failed: $_" -ForegroundColor "Red"
                            }
                        }
                        if (-not $pauseSuccess) {
                            Write-ConsoleOutput -Message "  WARNING: Unity may not have paused - check Unity console and server logs" -ForegroundColor "Yellow"
                        }
                    }
                } else {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION COMPLETE: Timeout reached (no active focus group)" -ForegroundColor "Yellow"
                }
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Calling Update-MonitorStatus to save completion" -ForegroundColor "Cyan"
                # CRITICAL: Ensure investigation state is properly reset BEFORE calling Update-MonitorStatus
                # Double-check that variables are reset (defensive programming)
                $script:isInvestigating = $false
                $script:investigationStartTime = $null
                $script:investigationCheckLogged = $false
                # Force immediate status update to ensure status file reflects completion
                Update-MonitorStatus
                $lastStatusUpdate = Get-Date
                # CRITICAL: Force another status update after a brief delay to ensure it's written
                Start-Sleep -Milliseconds 100
                Update-MonitorStatus
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Update-MonitorStatus completed (called twice), investigation state: isInvestigating=$($script:isInvestigating), startTime=$($script:investigationStartTime)" -ForegroundColor "Cyan"
                # CRITICAL: Set cooldown to prevent immediate restart - wait 5 seconds before allowing new investigation
                $script:lastInvestigationComplete = Get-Date
            } else {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] shouldCompleteNow is FALSE - investigation will continue" -ForegroundColor "Gray"
            }
        } else {
            # Investigation not active - but log why for diagnostics
            $whyNotActive = @()
            if (-not $script:isInvestigating) { $whyNotActive += "script:isInvestigating=false" }
            if (-not $script:investigationStartTime) { $whyNotActive += "script:startTime=null" }
            if ($script:investigationStartTime -and $script:investigationStartTime -isnot [DateTime]) { $whyNotActive += "script:startTime=invalid_type" }
            if (-not $statusFileInvestigationActive) { $whyNotActive += "statusFile:active=false" }
            if (-not $statusFileInvestigationStartTime) { $whyNotActive += "statusFile:startTime=null" }
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Investigation not active - completion check skipped. Reasons: $($whyNotActive -join ', ')" -ForegroundColor "Gray"
        }
        
        # CRITICAL FIX: Check for focused group and start investigation if needed
        # Check EVERY loop iteration (not just every 5 seconds) to catch issues immediately
        # BUT: Don't start immediately after completion - wait 5 seconds cooldown
        # CRITICAL: If Unity is paused, DO NOT start new investigations - wait for user/AI to fix the current one
        $canStartNewInvestigation = $true
        # Check both local variable AND status file to ensure we don't start investigations when Unity is paused
        $unityIsPaused = $isPaused
        try {
            $statusFilePath = Join-Path $script:projectRoot "logs\monitor-status.json"
            if (Test-Path $statusFilePath) {
                $statusData = Get-Content $statusFilePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                if ($statusData.paused -is [bool]) {
                    $unityIsPaused = $statusData.paused
                } elseif ($statusData.paused -is [string]) {
                    $unityIsPaused = ($statusData.paused -eq "True" -or $statusData.paused -eq "true" -or $statusData.paused -eq "1")
                }
            }
        } catch {
            # Status file read failed - use local variable
        }
        # CRITICAL FIX: Allow investigations to start even when Unity is paused
        # This allows us to investigate new issues that occur while Unity is paused
        # The investigation will complete and pause Unity again if needed
        # CRITICAL: Enforce 5-second cooldown to prevent immediate restart after completion
        if ($script:lastInvestigationComplete) {
            $timeSinceCompletion = ((Get-Date) - $script:lastInvestigationComplete).TotalSeconds
            if ($timeSinceCompletion -lt 5) {
                $canStartNewInvestigation = $false
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Cooldown active: $([Math]::Round($timeSinceCompletion, 1))s since last completion (need 5s)" -ForegroundColor "Gray"
            }
        }
        
        if (-not $script:isInvestigating -and $canStartNewInvestigation) {
            $pendingInfo = Get-PendingIssuesInfo
            # Check if there's actually a focused group in the file (even if Get-PendingIssuesInfo says InFocusMode=false)
            $hasFocusedGroup = $false
            try {
                if (Test-Path $pendingIssuesFile) {
                    $pendingContent = Get-Content $pendingIssuesFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
                    if ($pendingContent.focusedGroup -and $pendingContent.focusedGroup.rootIssue) {
                        $hasFocusedGroup = $true
                        # If Get-PendingIssuesInfo returned false but file has focusedGroup, use file data
                        if (-not $pendingInfo -or -not $pendingInfo.InFocusMode) {
                            $pendingInfo = @{
                                InFocusMode = $true
                                RootIssue = $pendingContent.focusedGroup.rootIssue
                                RelatedIssuesCount = if ($pendingContent.focusedGroup.relatedIssues) { $pendingContent.focusedGroup.relatedIssues.Count } else { 0 }
                                RelatedIssues = if ($pendingContent.focusedGroup.relatedIssues) { $pendingContent.focusedGroup.relatedIssues } else { @() }
                                GroupId = $pendingContent.focusedGroup.id
                            }
                        }
                    }
                }
            } catch {
                # File read failed - use pendingInfo as-is
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Failed to read pending-issues.json: $_" -ForegroundColor "Yellow"
            }
            
            # DIAGNOSTIC: Log why investigation isn't starting (every 5 seconds to avoid spam)
            if (-not $script:lastInvestigationStartCheck -or ((Get-Date) - $script:lastInvestigationStartCheck).TotalSeconds -ge 5) {
                if (-not $pendingInfo) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] No pending info - investigation not starting" -ForegroundColor "Gray"
                } elseif (-not $pendingInfo.InFocusMode -and -not $hasFocusedGroup) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Not in focus mode (InFocusMode=$($pendingInfo.InFocusMode), hasFocusedGroup=$hasFocusedGroup) - investigation not starting" -ForegroundColor "Gray"
                } elseif (-not $pendingInfo.RootIssue) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Focused group exists but no root issue" -ForegroundColor "Yellow"
                } elseif (-not $investigationEnabled) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation disabled in config" -ForegroundColor "Yellow"
                } elseif (-not $investigationTimeout -or $investigationTimeout -le 0) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation timeout invalid: $investigationTimeout" -ForegroundColor "Yellow"
                } else {
                    # All conditions met - start investigation
                    $script:isInvestigating = $true
                    $script:investigationStartTime = Get-Date
                    $script:investigationCheckLogged = $false
                    $script:investigationNullStartTimeLogged = $false
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Starting for existing focus group ($investigationTimeout seconds)" -ForegroundColor "Cyan"
                    Write-ConsoleOutput -Message "  Root Issue: $($pendingInfo.RootIssue.type) ($($pendingInfo.RootIssue.severity))" -ForegroundColor "White"
                    # CRITICAL: Force immediate status update to ensure status file reflects new investigation state
                    Update-MonitorStatus
                    $lastStatusUpdate = Get-Date
                    # CRITICAL: Force another status update after brief delay to ensure persistence
                    Start-Sleep -Milliseconds 100
                    Update-MonitorStatus
                }
                $script:lastInvestigationStartCheck = Get-Date
            }
        }
        
        # Check if log file exists
        if (-not (Test-Path $logFile)) {
            Start-Sleep -Seconds $checkInterval
            continue
        }
        
        # Get current log file size
        $currentSize = (Get-Item $logFile).Length
        
        # CRITICAL FIX: If file size is smaller than last position, file was rotated/cleared
        # Reset lastLogPosition to current size to start reading from current position
        if ($currentSize -lt $script:lastLogPosition) {
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Log file was rotated/cleared (size=$currentSize < lastPos=$($script:lastLogPosition)) - resetting position" -ForegroundColor "Yellow"
            $script:lastLogPosition = $currentSize  # Use script scope to ensure it persists
        }
        $lastLogPosition = $script:lastLogPosition  # Sync local variable
        
        # DIAGNOSTIC: Log file reading status every 10 seconds
        if (-not $script:lastLogReadDiagnostic -or ((Get-Date) - $script:lastLogReadDiagnostic).TotalSeconds -ge 10) {
            $fileSizeMB = [Math]::Round($currentSize / 1MB, 2)
            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] Log file: size=${fileSizeMB}MB ($currentSize bytes), lastPos=$lastLogPosition, diff=$($currentSize - $lastLogPosition), linesProcessed=$($stats.TotalLinesProcessed)" -ForegroundColor "Gray"
            $script:lastLogReadDiagnostic = Get-Date
        }
        
        # If file has grown, read new lines
        if ($currentSize -gt $script:lastLogPosition) {
            $lastLogPosition = $script:lastLogPosition  # Sync local variable
            # Use FileShare.ReadWrite to allow concurrent writes while reading
            $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $fileStream.Position = $lastLogPosition
            $reader = New-Object System.IO.StreamReader($fileStream)
            
            while ($null -ne ($line = $reader.ReadLine())) {
                try {
                $stats.TotalLinesProcessed++
                    $stats.LastLogActivity = Get-Date  # Update last activity timestamp
                    
                    # CRITICAL: Validate line is not null/empty and is a string
                    if ([string]::IsNullOrWhiteSpace($line)) {
                        continue
                    }
                    
                    # CRITICAL: Ensure line is a string (not an object)
                    $line = $line.ToString()
                
                # Skip our own monitoring logs and internal system logs
                if ($line -match '\[MONITORING\]|\[ISSUE_DETECTOR\]|\[LOG_WATCHER\]|\[TRACE\]|\[STATUS_REPORT\]|\[ACTIVE_MONITORING\]|\[WORKFLOW\]') {
                    continue
                }
                
                # Skip FIX_ATTEMPT SUCCESS logs (these are good, not errors)
                    # Match both [FIX_ATTEMPT] and [FIX ATTEMPT] (with or without underscore)
                    if ($line -match '\[FIX[_\s]ATTEMPT\].*SUCCESS' -or $line -match 'FIX_ATTEMPT.*SUCCESS' -or $line -match 'FIX ATTEMPT.*SUCCESS') {
                    continue
                }
                
                # Skip TRACE logs (informational only)
                # BUT: Don't skip [ROOT_TRACE] - these are important error indicators
                if ($line -match '\[TRACE\]' -and $line -notmatch '\[ROOT_TRACE\]') {
                        continue
                    }
                } catch {
                    # CRITICAL: If line reading fails, log error and continue
                    $errorMsg = "Error processing log line: $_"
                    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    "$timestamp [ERROR] $errorMsg" | Out-File -FilePath (Join-Path $script:projectRoot "logs\monitor-diagnostics.log") -Append -Encoding UTF8 -ErrorAction SilentlyContinue
                    continue
                }
                
                # During verification, check if issue reappears BEFORE normal detection
                if ($isVerifyingFix -and $verificationIssuePattern) {
                    $issue = Invoke-IssueDetector $line
                    if ($issue -and (Test-IssueMatchesVerificationPattern -issue $issue -verificationPattern $verificationIssuePattern)) {
                        # Issue reappeared during verification - fix failed
                        $fixApplied = Get-FixAppliedInfo
                        $pendingInfo = Get-PendingIssuesInfo
                        
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] VERIFICATION FAILED: Issue reappeared" -ForegroundColor "Red"
                        Write-ConsoleOutput -Message "  Issue: $($issue.type) ($($issue.severity)) from $($issue.source)" -ForegroundColor "White"
                        Write-ConsoleOutput -Message "  Fix did not resolve the issue" -ForegroundColor "Yellow"
                        
                        # Record fix attempt as failed
                        if ($fixApplied -and $pendingInfo.GroupId) {
                            $fixAttempt = @{
                                fixDescription = $fixApplied.fixDescription
                                requiredRestarts = $fixApplied.requiredRestarts
                                restartsCompleted = $fixApplied.requiredRestarts
                                verificationPeriod = $verificationPeriod
                                result = "failed"
                                failureReason = "Issue reappeared during verification"
                                newLogs = @($line)
                                insights = "Fix did not address root cause - issue pattern still occurring"
                            }
                            
                            # Write fix attempt to temp file to avoid PowerShell argument escaping issues
                            $tempFixAttemptFile = Join-Path $env:TEMP "fix-attempt-$(Get-Date -Format 'yyyyMMddHHmmss').json"
                            $fixAttempt | ConvertTo-Json -Depth 10 | Out-File -FilePath $tempFixAttemptFile -Encoding UTF8 -Force
                            
                            try {
                                # Use non-blocking async call
                                $nodeResult = Invoke-NodeAsync -ScriptPath $nodeScript -Arguments @("--record-fix-attempt", "--groupId", $pendingInfo.GroupId, "--fix-attempt-file", $tempFixAttemptFile) -JobTimeout 5
                                $recordResult = if ($nodeResult.Output) { $nodeResult.Output } else { "" }
                                if ($nodeResult.Success -and $nodeResult.ExitCode -eq 0) {
                                    Write-ConsoleOutput -Message "  Fix attempt recorded in investigation" -ForegroundColor "Cyan"
                                } else {
                                    Write-ConsoleOutput -Message "  WARNING: Failed to record fix attempt: $recordResult" -ForegroundColor "Yellow"
                                }
                            } catch {
                                Write-ConsoleOutput -Message "  WARNING: Failed to record fix attempt: $_" -ForegroundColor "Yellow"
                            } finally {
                                # Clean up temp file
                                if (Test-Path $tempFixAttemptFile) {
                                    Remove-Item $tempFixAttemptFile -Force -ErrorAction SilentlyContinue
                                }
                            }
                            
                            Write-ConsoleOutput -Message "  Re-entering investigation mode" -ForegroundColor "Yellow"
                        }
                        
                        # Clear fix-applied.json
                        if (Test-Path $fixAppliedFile) {
                            Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
                        }
                        
                        # Reset verification state and re-enter investigation
                        $isVerifyingFix = $false
                        $verificationStartTime = $null
                        $verificationPeriod = 0
                        $verificationIssuePattern = $null
                        $script:isInvestigating = $true
                        $script:investigationStartTime = Get-Date
                        $isPaused = $false  # Don't pause yet, let investigation complete first
                        
                        # Continue to normal issue detection below
                    }
                }
                
                # NEW: Check for issues using AI system first (if enabled), then fallback to pattern matching
                $issue = $null
                if ($script:aiIntegrationEnabled) {
                    try {
                        # Send log line to AI system for detection
                        $aiDetected = Detect-AIIssue -LogLine $line
                        if ($aiDetected -and $aiDetected.Issue) {
                            $issue = $aiDetected.Issue
                            # AI detected issue - use it
                        } else {
                            # AI didn't detect issue - try pattern matching as fallback
                            $issue = Invoke-IssueDetector $line
                        }
                    } catch {
                        # AI detection failed - fallback to pattern matching
                        $issue = Invoke-IssueDetector $line
                    }
                } else {
                    # AI not enabled - use pattern matching only
                    $issue = Invoke-IssueDetector $line
                }
                
                if ($issue) {
                    # Throttle duplicate issue detections - only show message once per 5 seconds per issue pattern
                    $issueKey = "$($issue.type)_$($issue.severity)_$($issue.source)"
                    $throttleKey = "issue_$issueKey"
                    
                    if (-not $script:issueThrottle) {
                        $script:issueThrottle = @{}
                    }
                    
                    $lastShown = $script:issueThrottle[$throttleKey]
                    $shouldShow = $true
                    
                    if ($lastShown) {
                        $timeSinceLastShown = (Get-Date) - $lastShown
                        if ($timeSinceLastShown.TotalSeconds -lt 5) {
                            $shouldShow = $false
                        }
                    }
                    
                    if ($shouldShow) {
                        $script:issueThrottle[$throttleKey] = Get-Date
                    # REPORT TO CONSOLE: Issue detected (but not yet paused)
                        # Use Write-ConsoleOutput to prevent scrolling and flickering
                        $issueMessage = "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTED: $($issue.type) ($($issue.severity))"
                        Write-ConsoleOutput -Message $issueMessage -ForegroundColor "Yellow"
                    }
                    
                    # Update statistics (ALWAYS update, even for duplicates)
                    $stats.IssuesDetected++
                    $stats.IssuesBySeverity[$issue.severity]++
                    $stats.IssuesBySource[$issue.source]++
                    $stats.LastIssueTime = Get-Date
                    
                    # Track recent issues (for status file) - ALL issues, including duplicates
                    if (-not $script:recentIssues) {
                        $script:recentIssues = @()
                    }
                    $issueInfo = @{
                        timestamp = (Get-Date).ToUniversalTime().ToString("o")
                        type = $issue.type
                        severity = $issue.severity
                        source = $issue.source
                        message = $line.Substring(0, [Math]::Min(200, $line.Length))
                    }
                    $script:recentIssues += $issueInfo
                    # Keep only last 50 issues
                    if ($script:recentIssues.Count -gt 50) {
                        $script:recentIssues = $script:recentIssues | Select-Object -Last 50
                    }
                    
                    # Update monitor status file immediately when issue is detected
                    Update-MonitorStatus -statusUpdate @{
                        lastIssueDetected = (Get-Date).ToUniversalTime().ToString("o")
                        lastIssueType = $issue.type
                        lastIssueSeverity = $issue.severity
                        lastIssueSource = $issue.source
                        totalIssuesDetected = $stats.IssuesDetected
                    } -ErrorAction SilentlyContinue
                    
                    # Track unique patterns
                    $patternKey = $issue.type + "_" + $issue.severity
                    if (-not $stats.UniquePatterns.ContainsKey($patternKey)) {
                        $stats.UniquePatterns[$patternKey] = 0
                    }
                    $stats.UniquePatterns[$patternKey]++
                    
                    # Log ALL issues to pending-issues.json (all severities enter focus mode)
                    # Only pause debugger for critical/high severity issues
                    $shouldPauseDebugger = ($issue.severity -eq 'critical' -or $issue.severity -eq 'high') -and -not $isPaused
                    
                    if ($shouldPauseDebugger) {
                        # Explain why we're pausing
                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] PAUSING: $($issue.severity.ToUpper()) severity issue detected" -ForegroundColor "Red"
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
                        # Truncate and escape the message to prevent JSON issues
                        $maxMessageLength = 1000
                        $safeMessage = $line
                        if ($safeMessage.Length -gt $maxMessageLength) {
                            $safeMessage = $safeMessage.Substring(0, $maxMessageLength) + "... (truncated)"
                        }
                        # Remove null bytes, control characters, and normalize line breaks
                        # Replace backticks first (PowerShell escape sequences) before other replacements
                        $safeMessage = $safeMessage -replace "``", "'" -replace "`0", "" -replace "`r`n", " " -replace "`r", " " -replace "`n", " " -replace "`t", " "
                        
                        $issueData = @{
                            message = $safeMessage
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
                            
                            # If tableId is null, try to get it from active simulation tables (non-blocking)
                            if (-not $tableId) {
                                try {
                                    $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                                    if ($healthResult.Success -and $healthResult.StatusCode -eq 200) {
                                        $health = $healthResult.Content | ConvertFrom-Json
                                        if ($health.activeSimulations -gt 0) {
                                            # Try to get the first active simulation table ID (non-blocking)
                                            try {
                                                $tablesResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/tables" -TimeoutSec 2 -JobTimeout 3
                                                if ($tablesResult.Success -and $tablesResult.StatusCode -eq 200) {
                                                    $tables = $tablesResult.Content | ConvertFrom-Json
                                                    $simTable = $tables | Where-Object { $_.isSimulation -eq $true -and $_.activePlayers -gt 0 } | Select-Object -First 1
                                                    if ($simTable -and $simTable.id) {
                                                        $tableId = $simTable.id
                                                        Write-ConsoleOutput -Message "  Table ID: $tableId (extracted from active simulation)" -ForegroundColor "Cyan"
                                                    }
                                                }
                                            } catch {
                                                # Failed to get tables - continue with null tableId
                                            }
                                        }
                                    }
                                } catch {
                                    # Health check failed - continue with null tableId
                                }
                            }
                            
                            if ($tableId) {
                                Write-ConsoleOutput -Message "  Table ID: $tableId" -ForegroundColor "Cyan"
                            } else {
                                Write-ConsoleOutput -Message "  Table ID: Not found - will pause all active simulations" -ForegroundColor "Yellow"
                            }
                            
                            # Start investigation phase (gather related issues before pausing)
                            # Only start investigation if issue was successfully logged AND it's a new focus group
                            if ($addResult -and $addResult.reason -eq 'new_focus_group' -and $investigationEnabled -and $investigationTimeout -gt 0) {
                                # New issue detected - start investigation phase
                                # BUT: Don't restart investigation if one is already in progress
                                if (-not $script:isInvestigating) {
                                    $script:isInvestigating = $true
                                    $script:investigationStartTime = Get-Date
                                    $script:investigationCheckLogged = $false  # Reset for new investigation
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Starting ($investigationTimeout seconds) - see statistics for details" -ForegroundColor "Cyan"
                                    # DIAGNOSTIC: Verify variables were set correctly
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation variables set: isInvestigating=$($script:isInvestigating), startTime=$($script:investigationStartTime), type=$($script:investigationStartTime.GetType().Name)" -ForegroundColor "Green"
                                    # CRITICAL: Force immediate status update so investigation shows as active
                                    Update-MonitorStatus
                                    $lastStatusUpdate = Get-Date  # Reset timer so next update happens in 5 seconds
                                    $currentIssue = $line
                                } else {
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Already in progress - new issue will be added to existing investigation" -ForegroundColor "Gray"
                                }
                            } else {
                                # DIAGNOSTIC: Log why investigation didn't start
                                if ($addResult -and $addResult.reason -eq 'new_focus_group') {
                                    $whyNot = @()
                                    if (-not $investigationEnabled) { $whyNot += "investigationEnabled=false" }
                                    if (-not $investigationTimeout -or $investigationTimeout -le 0) { $whyNot += "investigationTimeout=$investigationTimeout" }
                                    if ($whyNot.Count -gt 0) {
                                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [SELF-DIAGNOSTIC] Investigation NOT started: $($whyNot -join ', ')" -ForegroundColor "Yellow"
                                    }
                                }
                                # Investigation disabled or timeout is 0 - pause immediately
                                # OR this is a related issue added during investigation - don't restart investigation
                                # OR issue detector failed - don't start investigation
                                if (-not $script:isInvestigating) {
                                    # Pause debugger immediately (with automatic verification)
                                    if ($config.unity.pauseDebuggerOnIssue) {
                            $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                                        $reason = "$($issue.type) - $($issue.severity) severity"
                                        $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason $reason
                                        if ($pauseSuccess) {
                                            $isPaused = $true
                                            $currentIssue = $line
                                        } else {
                                            Write-ConsoleOutput -Message "  Monitor will automatically retry when Unity is ready" -ForegroundColor "Yellow"
                                        }
                                    }
                                }
                            }
                        } elseif (-not $addResult) {
                            # Add-PendingIssue returned null (complete failure)
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTOR FAILED: Complete failure - issue NOT logged" -ForegroundColor "Red"
                            Write-ConsoleOutput -Message "  Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "Yellow"
                            Write-ConsoleOutput -Message "  Diagnostics:" -ForegroundColor "Yellow"
                            Write-ConsoleOutput -Message "    - Check if BrokenPromise AI system is working: node monitoring/integration/BrokenPromise-integration.js detect-issue 'test'" -ForegroundColor "Gray"
                            Write-ConsoleOutput -Message "    - Check if pending-issues.json is writable" -ForegroundColor "Gray"
                            Write-ConsoleOutput -Message "    - Check Node.js error output for details" -ForegroundColor "Gray"
                            
                            # Don't start investigation if issue detector completely failed
                            # Still pause Unity if it's a critical/high severity issue
                            if (-not $isPaused -and $config.unity.pauseDebuggerOnIssue -and ($issue.severity -eq 'critical' -or $issue.severity -eq 'high')) {
                                try {
                                    $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                                    $reason = "$($issue.type) - $($issue.severity) severity (issue detector failed)"
                                    $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason $reason
                                    if ($pauseSuccess) {
                                        $isPaused = $true
                                        $currentIssue = $line
                                    } else {
                                        Write-ConsoleOutput -Message "  Monitor will automatically retry when Unity is ready" -ForegroundColor "Yellow"
                                    }
                            } catch {
                                    Write-ConsoleOutput -Message "  ERROR: Failed to pause debugger: $_" -ForegroundColor "Red"
                                }
                            }
                        } elseif ($addResult -and -not $addResult.success) {
                            # Issue detector returned an error response
                            $errorMsg = if ($addResult.error) { $addResult.error } else { "Issue detection failed - check BrokenPromise AI system" }
                            $errorReason = if ($addResult.reason) { $addResult.reason } else { "detection_failed" }
                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTOR ERROR: Failed to log issue ($errorReason)" -ForegroundColor "Red"
                            Write-ConsoleOutput -Message "  Error: $errorMsg" -ForegroundColor "Yellow"
                            Write-ConsoleOutput -Message "  Issue detected but NOT logged - will retry on next detection" -ForegroundColor "Gray"
                            
                            # Don't start investigation if issue detector failed
                            # Still pause Unity if it's a critical/high severity issue
                            if (-not $isPaused -and $config.unity.pauseDebuggerOnIssue -and ($issue.severity -eq 'critical' -or $issue.severity -eq 'high')) {
                                try {
                                    $reason = "$($issue.type) - $($issue.severity) severity (issue detector failed)"
                                    $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason $reason
                                    if ($pauseSuccess) {
                                        $isPaused = $true
                                        $currentIssue = $line
                                    } else {
                                        Write-ConsoleOutput -Message "  Monitor will automatically retry when Unity is ready" -ForegroundColor "Yellow"
                                    }
                                } catch {
                                    Write-ConsoleOutput -Message "  ERROR: Failed to pause debugger: $_" -ForegroundColor "Red"
                                }
                            }
                        } else {
                            # Handle different failure reasons (queued, duplicate, etc.)
                            if ($addResult -and $addResult.reason -eq 'queued') {
                                # Issue was queued (unrelated to focused issue)
                                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE QUEUED: Unrelated to focused issue - will process later" -ForegroundColor "Gray"
                            } elseif ($addResult -and ($addResult.reason -eq 'duplicate' -or $addResult.reason -eq 'duplicate_in_group')) {
                                # Don't write to console - update stats display instead
                                # Write-Info "Duplicate issue detected (already logged)"
                                # CRITICAL: Even for duplicates, if Unity isn't paused yet, we should pause it
                                # This ensures Unity stops logging and gives user time to report the issue
                                if (-not $isPaused -and $config.unity.pauseDebuggerOnIssue) {
                                    try {
                                    $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                                        $reason = "Duplicate issue: $($issue.type) - $($issue.severity) severity"
                                        
                                        # Use non-blocking pause function
                                        $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason $reason
                                        if ($pauseSuccess) {
                                            $isPaused = $true
                                            $currentIssue = $line
                                        }
                                    } catch {
                                        # Pause failed - continue anyway
                                        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Failed to pause Unity for duplicate issue: $_" -ForegroundColor "Yellow"
                                    }
                                }
                            } else {
                                $errorMsg = if ($addResult -and $addResult.error) { $addResult.error } else { "Issue detection failed - check BrokenPromise AI system" }
                                $logFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] FAILED TO LOG ISSUE: $errorMsg"
                                Write-ConsoleOutput -Message $logFailMsg -ForegroundColor "Red"
                                Write-ConsoleOutput -Message "  Issue detected but NOT logged to pending-issues.json" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "  Diagnostics:" -ForegroundColor "Yellow"
                                Write-ConsoleOutput -Message "    - Check if BrokenPromise AI system is working: node monitoring/integration/BrokenPromise-integration.js detect-issue 'test'" -ForegroundColor "Gray"
                                Write-ConsoleOutput -Message "    - Check if pending-issues.json is writable" -ForegroundColor "Gray"
                                Write-ConsoleOutput -Message "    - Check Node.js error output for details" -ForegroundColor "Gray"
                                
                                # CRITICAL: Still trigger debugger break even if issue logging failed
                                # Unity should still pause when critical issues are detected
                                if ($config.unity.pauseDebuggerOnIssue) {
                                    try {
                                        $escapedMessage = $line.Replace('"','\"').Replace("`n"," ").Replace("`r"," ").Substring(0,[Math]::Min(200,$line.Length))
                                        $reason = "$($issue.type) - $($issue.severity) severity (logging failed)"
                                        
                                        # Use non-blocking pause function
                                        $pauseSuccess = Invoke-PauseUnity -tableId $tableId -reason $reason
                                        if ($pauseSuccess) {
                                            $stats.PauseMarkersWritten++
                                            Write-ConsoleOutput -Message "  Unity paused via API (despite logging failure)" -ForegroundColor "Yellow"
                                        } else {
                                            Write-ConsoleOutput -Message "  WARNING: Failed to pause Unity (despite logging failure)" -ForegroundColor "Yellow"
                                        }
                                    } catch {
                                        Write-ConsoleOutput -Message "  ERROR: Failed to pause Unity: $_" -ForegroundColor "Red"
                                    }
                                }
                                
                                # Set paused state even though logging failed
                                $isPaused = $true
                                $currentIssue = $line
                            }
                        }
                    } else {
                        # Issue detected but not pausing (medium/low severity or already paused)
                        if ($issue.severity -eq 'medium' -or $issue.severity -eq 'low') {
                            # Medium/low severity issues still enter focus mode, just don't pause debugger
                            # Extract table ID if available
                            $tableId = $null
                            if ($line -match 'tableId.*?"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?"([^"]+)"') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?(\w{8,})') {
                                $tableId = $matches[1]
                            }
                            
                            # Add issue to pending-issues.json (enters focus mode, but no pause)
                            $maxMessageLength = 1000
                            $safeMessage = $line
                            if ($safeMessage.Length -gt $maxMessageLength) {
                                $safeMessage = $safeMessage.Substring(0, $maxMessageLength) + "... (truncated)"
                            }
                            $safeMessage = $safeMessage -replace "``", "'" -replace "`0", "" -replace "`r`n", " " -replace "`r", " " -replace "`n", " " -replace "`t", " "
                            
                            $issueData = @{
                                message = $safeMessage
                                source = $issue.source
                                severity = $issue.severity
                                type = $issue.type
                                tableId = $tableId
                            }
                            
                            $addResult = Add-PendingIssue $issueData
                            
                            if ($addResult -and $addResult.success) {
                                $stats.LastIssueLogged = Get-Date
                                
                                # Check if this started a new focus group or was added to existing
                                if ($addResult.reason -eq 'new_focus_group') {
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] FOCUS MODE: New issue detected - entering focus mode (no pause)" -ForegroundColor "Yellow"
                                    Write-ConsoleOutput -Message "  Root Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "White"
                                    Write-ConsoleOutput -Message "  Group ID: $($addResult.groupId)" -ForegroundColor "Cyan"
                                    Write-ConsoleOutput -Message "  Note: Medium/low severity issues don't pause debugger" -ForegroundColor "Gray"
                                    
                                    # Start investigation phase for medium/low issues too
                                    # Only if issue was successfully logged
                                    # BUT: Don't restart investigation if one is already in progress
                                    if ($addResult -and $addResult.success -and $investigationEnabled -and $investigationTimeout -gt 0) {
                                        if (-not $script:isInvestigating) {
                                            $script:isInvestigating = $true
                                            $script:investigationStartTime = Get-Date
                                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Starting investigation phase ($investigationTimeout seconds)" -ForegroundColor "Cyan"
                                            Write-ConsoleOutput -Message "  Gathering related issues..." -ForegroundColor "Gray"
                                            $currentIssue = $line
                                        } else {
                                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Already in progress - new issue will be added to existing investigation" -ForegroundColor "Gray"
                                        }
                                    }
                                } elseif ($addResult.reason -eq 'added_to_group') {
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] RELATED ISSUE: Added to focus group" -ForegroundColor "Yellow"
                                    Write-ConsoleOutput -Message "  Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "White"
                                    Write-ConsoleOutput -Message "  Group ID: $($addResult.groupId)" -ForegroundColor "Cyan"
                                } else {
                                    $issueMessage = "[$(Get-Date -Format 'HH:mm:ss')] ISSUE DETECTED: $($issue.type) ($($issue.severity))"
                                    Write-ConsoleOutput -Message $issueMessage -ForegroundColor "Yellow"
                                }
                                
                                $messagePreview = "  Message: $($line.Substring(0, [Math]::Min(100, $line.Length)))"
                                Write-ConsoleOutput -Message $messagePreview -ForegroundColor "Gray"
                            }
                        } elseif ($isPaused) {
                            # Unity is already paused, but we should still log issues as related issues
                            # Extract table ID if available
                            $tableId = $null
                            if ($line -match 'tableId.*?"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?"([^"]+)"') {
                                $tableId = $matches[1]
                            }
                            elseif ($line -match 'tableId.*?(\w{8,})') {
                                $tableId = $matches[1]
                            }
                            
                            # Still log issue to pending-issues.json (will be added as related issue or queued)
                            $maxMessageLength = 1000
                            $safeMessage = $line
                            if ($safeMessage.Length -gt $maxMessageLength) {
                                $safeMessage = $safeMessage.Substring(0, $maxMessageLength) + "... (truncated)"
                            }
                            $safeMessage = $safeMessage -replace "``", "'" -replace "`0", "" -replace "`r`n", " " -replace "`r", " " -replace "`n", " " -replace "`t", " "
                            
                            $issueData = @{
                                message = $safeMessage
                                source = $issue.source
                                severity = $issue.severity
                                type = $issue.type
                                tableId = $tableId
                            }
                            
                            $addResult = Add-PendingIssue $issueData
                            
                            if ($addResult -and $addResult.success) {
                                if ($addResult.reason -eq 'new_focus_group') {
                                    # New focus group created - start investigation even if Unity is already paused
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] FOCUS MODE: New issue detected - entering focus mode (Unity already paused)" -ForegroundColor "Yellow"
                                    Write-ConsoleOutput -Message "  Root Issue: $($issue.type) ($($issue.severity))" -ForegroundColor "White"
                                    Write-ConsoleOutput -Message "  Group ID: $($addResult.groupId)" -ForegroundColor "Cyan"
                                    
                                    # Start investigation phase even if Unity is already paused
                                    # BUT: Don't restart investigation if one is already in progress
                                    if ($investigationEnabled -and $investigationTimeout -gt 0) {
                                        if (-not $script:isInvestigating) {
                                            $script:isInvestigating = $true
                                            $script:investigationStartTime = Get-Date
                                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Starting ($investigationTimeout seconds) - see statistics for details" -ForegroundColor "Cyan"
                                            $currentIssue = $line
                                        } else {
                                            Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] INVESTIGATION: Already in progress - new issue will be added to existing investigation" -ForegroundColor "Gray"
                                        }
                                    }
                                } elseif ($addResult.reason -eq 'added_to_group') {
                                    # Related issue added to focused group
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] RELATED ISSUE: Added to focused group (Unity already paused)" -ForegroundColor "Yellow"
                                } elseif ($addResult.reason -eq 'queued') {
                                    # Unrelated issue queued
                                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] ISSUE QUEUED: Unrelated to focused issue (Unity already paused)" -ForegroundColor "Gray"
                                }
                            } elseif ($addResult -and ($addResult.reason -eq 'duplicate' -or $addResult.reason -eq 'duplicate_in_group')) {
                                # Duplicate issue - already logged, just ignore it silently
                                # Throttle duplicate messages - only show once per 30 seconds per issue pattern to reduce noise
                                $issueKey = "$($issue.type)_$($issue.severity)_$($issue.source)"
                                $throttleKey = "paused_duplicate_$issueKey"
                                
                                if (-not $script:issueThrottle) {
                                    $script:issueThrottle = @{}
                                }
                                
                                $lastShown = $script:issueThrottle[$throttleKey]
                                $shouldShow = $true
                                
                                if ($lastShown) {
                                    $timeSinceLastShown = (Get-Date) - $lastShown
                                    if ($timeSinceLastShown.TotalSeconds -lt 30) {
                                        $shouldShow = $false
                                    }
                                }
                                
                                if ($shouldShow) {
                                    $script:issueThrottle[$throttleKey] = Get-Date
                                    # Don't show message for duplicates - they're already logged, just being ignored
                                    # This reduces console noise when the same issue repeats
                                }
                            }
                        }
                    }
                }
            }
            }
            
            $reader.Close()
            $fileStream.Close()
            $script:lastLogPosition = $currentSize  # Use script scope to ensure it persists
            $lastLogPosition = $script:lastLogPosition  # Sync local variable
        }
        
        # Check for fix-applied.json and start verification phase
        $fixApplied = Get-FixAppliedInfo
        if ($fixApplied -and -not $isVerifyingFix) {
            # Fix was applied - start verification phase
            $pendingInfo = Get-PendingIssuesInfo
            
            # Check if investigation is still in progress
            if ($script:isInvestigating) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: fix-applied.json detected but investigation still in progress - waiting for investigation to complete" -ForegroundColor "Yellow"
                # Don't start verification yet - wait for investigation to complete
            }
            elseif ($pendingInfo.InFocusMode) {
                # Check if groupId matches
                if ($pendingInfo.GroupId -ne $fixApplied.groupId) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: fix-applied.json groupId mismatch" -ForegroundColor "Yellow"
                    Write-ConsoleOutput -Message "  Expected: $($pendingInfo.GroupId)" -ForegroundColor "White"
                    Write-ConsoleOutput -Message "  Got: $($fixApplied.groupId)" -ForegroundColor "White"
                    Write-ConsoleOutput -Message "  Cleaning up stale fix-applied.json" -ForegroundColor "Gray"
                    Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
                }
                elseif ($pendingInfo.GroupId -eq $fixApplied.groupId) {
                    # GroupId matches - start verification
                    # Start verification phase
                    # NOTE: Keep $isPaused = true during verification - Unity stays paused until verification completes
                    # Unity's Debug.Break() pause will remain until user resumes debugger or verification completes
                    $isVerifyingFix = $true
                    # $isPaused stays true - Unity remains paused during verification
                    $script:isInvestigating = $false  # Investigation complete, now verifying
                    
                    $rootIssue = $pendingInfo.RootIssue
                    $requiredRestarts = if ($fixApplied.requiredRestarts) { $fixApplied.requiredRestarts } else { @() }
                    
                    # Calculate verification period
                    $verificationPeriod = Calculate-VerificationPeriod -severity $rootIssue.severity -requiredRestarts $requiredRestarts -issueType $rootIssue.type
                    
                    # Store verification pattern (exact match: type, source, tableId)
                    $verificationIssuePattern = @{
                        type = $rootIssue.type
                        source = $rootIssue.source
                        tableId = $rootIssue.tableId
                    }
                    
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] VERIFICATION: Fix applied, starting verification phase" -ForegroundColor "Cyan"
                    Write-ConsoleOutput -Message "  Fix: $($fixApplied.fixDescription)" -ForegroundColor "White"
                    Write-ConsoleOutput -Message "  Required Restarts: $(if ($requiredRestarts.Count -gt 0) { $requiredRestarts -join ', ' } else { 'None' })" -ForegroundColor "Cyan"
                    Write-ConsoleOutput -Message "  Verification Period: $verificationPeriod seconds" -ForegroundColor "Cyan"
                    
                    # Check for multiple failed attempts and show warning
                    try {
                        if (Test-Path $pendingIssuesFile) {
                            $pendingContent = Get-Content $pendingIssuesFile -Raw | ConvertFrom-Json
                            if ($pendingContent.focusedGroup -and $pendingContent.focusedGroup.fixAttempts) {
                                $failedAttempts = ($pendingContent.focusedGroup.fixAttempts | Where-Object { $_.result -eq "failed" }).Count
                                if ($failedAttempts -ge 5) {
                                    Write-ConsoleOutput -Message "  WARNING: $failedAttempts failed fix attempts - consider different approach" -ForegroundColor "Yellow"
                                }
                            }
                        }
                    } catch {
                        # Ignore errors reading fix attempts
                    }
                    
                    # Perform required restarts
                    if ($requiredRestarts.Count -gt 0) {
                        Write-ConsoleOutput -Message "  Restarting services..." -ForegroundColor "Yellow"
                        $restartOrder = @("database", "server", "unity")
                        $restartFailures = @()
                        foreach ($service in $restartOrder) {
                            if ($requiredRestarts -contains $service) {
                                Write-ConsoleOutput -Message "    Restarting $service..." -ForegroundColor "Gray"
                                $restartSuccess = $false
                                switch ($service) {
                                    "database" { 
                                        $result = Restart-DatabaseIfNeeded
                                        $restartSuccess = $result
                                    }
                                    "server" { 
                                        try {
                                            $serverProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*poker*" -or $_.Path -like "*poker-server*" } | Select-Object -First 1
                                            if ($serverProcess) {
                                                Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
                                                Start-Sleep -Seconds 2
                                            }
                                            Start-ServerIfNeeded | Out-Null
                                            $restartSuccess = $true
                                        } catch {
                                            $restartSuccess = $false
                                        }
                                    }
                                    "unity" { 
                                        $result = Restart-UnityIfNeeded
                                        $restartSuccess = $result
                                    }
                                }
                                if (-not $restartSuccess) {
                                    $restartFailures += $service
                                    Write-ConsoleOutput -Message "    WARNING: Failed to restart $service" -ForegroundColor "Yellow"
                                }
                            }
                        }
                        if ($restartFailures.Count -gt 0) {
                            Write-ConsoleOutput -Message "  WARNING: Some services failed to restart: $($restartFailures -join ', ')" -ForegroundColor "Yellow"
                        }
                    }
                    
                    # Wait for services to be ready (with timeout)
                    Write-ConsoleOutput -Message "  Waiting for services to be ready..." -ForegroundColor "Yellow"
                    $servicesReady = $false
                    $readyTimeout = 60  # Max 60 seconds to wait for services
                    $readyStartTime = Get-Date
                    while (-not $servicesReady -and ((Get-Date) - $readyStartTime).TotalSeconds -lt $readyTimeout) {
                        $readyCheck = Test-ServicesReady -requiredRestarts $requiredRestarts
                        if ($readyCheck.AllReady) {
                            $servicesReady = $true
                        } else {
                            # Non-blocking sleep - use small increments to allow loop to continue checking other things
                            # This is in verification phase, so blocking is acceptable but minimize it
                            Start-Sleep -Seconds 1  # Reduced from 2 to 1 for more responsive checking
                        }
                    }
                    
                    if ($servicesReady) {
                        Write-ConsoleOutput -Message "  Services ready - starting verification timer" -ForegroundColor "Green"
                        $verificationStartTime = Get-Date
                    } else {
                        Write-ConsoleOutput -Message "  WARNING: Services not ready after timeout, starting verification anyway" -ForegroundColor "Yellow"
                        $verificationStartTime = Get-Date
                    }
                }
            } elseif (-not $pendingInfo.InFocusMode) {
                # No focused group - clean up stale fix-applied.json
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] WARNING: fix-applied.json found but no focused group - cleaning up stale file" -ForegroundColor "Yellow"
                Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
            }
        }
        
        # Verification phase: Monitor logs for issue pattern
        if ($isVerifyingFix -and $verificationStartTime) {
            $verificationElapsed = (Get-Date) - $verificationStartTime
            
            # Check if verification period has elapsed
            if ($verificationElapsed.TotalSeconds -ge $verificationPeriod) {
                # Verification complete - no issue reappeared
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] VERIFICATION PASSED: Issue did not reappear" -ForegroundColor "Green"
                Write-ConsoleOutput -Message "  Fix confirmed - issue resolved" -ForegroundColor "Green"
                
                # Clear fix-applied.json
                if (Test-Path $fixAppliedFile) {
                    Remove-Item $fixAppliedFile -Force -ErrorAction SilentlyContinue
                }
                
                # Resume Unity (non-blocking) - call resume API to set table.isPaused = false
                $tableIdToResume = $null
                try {
                    # Get tableId from pending issues before clearing
                    $pendingInfoBeforeClear = Get-PendingIssuesInfo
                    if ($pendingInfoBeforeClear -and $pendingInfoBeforeClear.RootIssue -and $pendingInfoBeforeClear.RootIssue.tableId) {
                        $tableIdToResume = $pendingInfoBeforeClear.RootIssue.tableId
                    } elseif ($currentIssue -and $currentIssue -match 'tableId.*?"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"') {
                        $tableIdToResume = $matches[1]
                    }
                    
                    # Try to get tableId from active simulation if not found
                    if (-not $tableIdToResume) {
                        $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                        if ($healthResult.Success) {
                            $serverHealth = $healthResult.Content | ConvertFrom-Json
                            if ($serverHealth.activeSimulations -gt 0) {
                                $tablesResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/tables" -TimeoutSec 2 -JobTimeout 3
                                if ($tablesResult.Success) {
                                    $tables = $tablesResult.Content | ConvertFrom-Json
                                    $simTable = $tables | Where-Object { $_.isSimulation -eq $true } | Select-Object -First 1
                                    if ($simTable) {
                                        $tableIdToResume = $simTable.id
                                    }
                                }
                            }
                        }
                    }
                    
                    # Call resume API if we have a tableId
                    if ($tableIdToResume) {
                        $resumeResult = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulations/$tableIdToResume/resume" -Method POST -TimeoutSec 5 -JobTimeout 6
                        if ($resumeResult.Success) {
                            Write-ConsoleOutput -Message "  Unity resumed via API for table $tableIdToResume" -ForegroundColor "Green"
                        } else {
                            Write-ConsoleOutput -Message "  WARNING: Failed to resume Unity via API: $($resumeResult.Error)" -ForegroundColor "Yellow"
                        }
                    } else {
                        Write-ConsoleOutput -Message "  WARNING: Could not determine tableId to resume Unity" -ForegroundColor "Yellow"
                    }
                } catch {
                    Write-ConsoleOutput -Message "  WARNING: Error resuming Unity: $_" -ForegroundColor "Yellow"
                }
                
                # Clear pending-issues.json (this will move to next queued issue if any) - non-blocking
                $nodeResult = Invoke-NodeAsync -ScriptPath $nodeScript -Arguments @("--clear-pending") -JobTimeout 5
                $clearResult = if ($nodeResult.Output) { $nodeResult.Output } else { "" }
                if ($nodeResult.Success -and $clearResult -match '"success":\s*true') {
                    $pendingInfo = Get-PendingIssuesInfo
                    if ($pendingInfo.QueuedIssuesCount -gt 0) {
                        Write-ConsoleOutput -Message "  Next investigation: $($pendingInfo.QueuedIssuesCount) queued issue(s) waiting" -ForegroundColor "Cyan"
                    } else {
                        Write-ConsoleOutput -Message "  No queued issues - Monitor ready for next issue" -ForegroundColor "Cyan"
                    }
                }
                
                # Reset verification state
                $isVerifyingFix = $false
                $verificationStartTime = $null
                $verificationPeriod = 0
                $verificationIssuePattern = $null
                $isPaused = $false
                $script:isInvestigating = $false
                $script:investigationStartTime = $null
                $currentIssue = $null
            } else {
                # Still verifying - show countdown every 10 seconds
                $remaining = [Math]::Max(0, $verificationPeriod - $verificationElapsed.TotalSeconds)
                if ($remaining -gt 0 -and ($remaining % 10 -lt 1)) {
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] VERIFYING: $([Math]::Floor($remaining))s remaining..." -ForegroundColor "Gray"
                }
            }
        }
        
        # During verification, check if issue reappears in new logs
        if ($isVerifyingFix -and $verificationIssuePattern -and $currentSize -gt $lastLogPosition) {
            # We're reading new log lines - check if issue pattern matches
            # This is handled in the log reading loop below
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
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Process detected" -ForegroundColor "Green"
            }
            
            if ($unityActualStatus.ConnectedToServer -and -not $wasUnityConnected) {
                Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connected to server!" -ForegroundColor "Green"
            }
            
            # Warn if Unity is not actually playing (connected but idle)
            if ($unityActualStatus.ProcessRunning -and $unityActualStatus.ConnectedToServer -and -not $unityActualStatus.InGameScene) {
                if (-not $wasUnityActive -or ($now - $lastUnityWarning).TotalSeconds -gt 60) {
                    $unityNotInGameMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connected but NOT in game scene (likely in MainMenuScene)"
                    Write-ConsoleOutput -Message $unityNotInGameMsg -ForegroundColor "Yellow"
                    Write-ConsoleOutput -Message "  Details: $($unityActualStatus.Details -join '; ')" -ForegroundColor "Gray"
                    $lastUnityWarning = $now
                }
            }
            
            # If Unity is not running, not connected, or not actively playing (in simulation mode), restart it
            # BUT: Don't restart Unity if server was just restarted (within last 60 seconds) to prevent restart loops
            if ($config.automation.autoRestartUnity) {
                # Check if server was just restarted
                $serverJustRestarted = $false
                if ($script:lastServerRestart) {
                    $timeSinceServerRestart = (Get-Date) - $script:lastServerRestart
                    if ($timeSinceServerRestart.TotalSeconds -lt 60) {
                        $serverJustRestarted = $true
                    }
                }
                
                # Check Unity restart - but allow starting Unity if it's not running at all (even during cooldown)
                # Only block restart if Unity is running but not connected (during cooldown)
                $shouldRestart = $false
                $restartReason = ""
                
                if (-not $unityActualStatus.ProcessRunning) {
                    # Unity is not running at all - always start it, even during server cooldown
                    $shouldRestart = $true
                    $restartReason = "Unity process not running"
                } elseif ($unityActualStatus.Status -eq "CRASHED") {
                    # Unity process is running but not responding (crashed/hung) - restart immediately
                    $shouldRestart = $true
                    $restartReason = "Unity process crashed/hung (not responding)"
                } elseif (-not $serverJustRestarted) {
                    # Unity is running - only check connection/restart if server wasn't just restarted
                    if (-not $unityActualStatus.ConnectedToServer) {
                        # Check if Unity process was just started (give it time to initialize and connect)
                        # Unity needs time to: start, enter play mode, initialize, connect, login
                        $unityJustStarted = $false
                        $unityProcess = Get-Process -Name "Unity" -ErrorAction SilentlyContinue | Select-Object -First 1
                        if ($unityProcess) {
                            try {
                                $timeSinceUnityStart = (Get-Date) - $unityProcess.StartTime
                                # Give Unity 45 seconds to start, enter play mode, initialize, connect, login
                                if ($timeSinceUnityStart.TotalSeconds -lt 45) {
                                    $unityJustStarted = $true
                                }
                            } catch {
                                # If we can't get start time, assume Unity wasn't just started
                            }
                        }
                        
                        if ($unityJustStarted) {
                            # Unity was just started - give it time to connect
                            $timeRemaining = 45 - $timeSinceUnityStart.TotalSeconds
                            if ($timeRemaining -gt 0) {
                                $waitingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Waiting for connection (started $([Math]::Round($timeSinceUnityStart.TotalSeconds))s ago, $([Math]::Round($timeRemaining))s remaining)"
                                Write-ConsoleOutput -Message $waitingMsg -ForegroundColor "Gray"
                            }
                        } else {
                            # Check if Unity is actually trying to connect (recent connection attempts in logs)
                            # BUT: If server is down, Unity can't connect - restart Unity anyway - non-blocking
                            $serverIsDown = $false
                            try {
                                $serverCheckResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -TimeoutSec 2 -JobTimeout 3
                                if (-not $serverCheckResult.Success) {
                                    $serverIsDown = $true
                                }
                            } catch {
                                $serverIsDown = $true
                            }
                            
                            $recentConnectionAttempt = $false
                            if ($unityActualStatus.LastConnectionActivity -and $unityActualStatus.LastConnectionActivity -is [DateTime]) {
                                try {
                                    $timeSinceConnectionAttempt = (Get-Date) - $unityActualStatus.LastConnectionActivity
                                    if ($timeSinceConnectionAttempt.TotalSeconds -lt 30) {
                                        $recentConnectionAttempt = $true
                                    }
                                } catch {
                                    # Date arithmetic failed - treat as no recent connection
                                    $recentConnectionAttempt = $false
                                }
                            }
                            
                            # If server is down, restart Unity (it can't connect anyway)
                            # If server is up but Unity isn't connecting, also restart
                            if ($serverIsDown -or -not $recentConnectionAttempt) {
                                $shouldRestart = $true
                                if ($serverIsDown) {
                                    $restartReason = "Unity not connected - server is down (restarting Unity to wait for server)"
                                } else {
                                    $restartReason = "Unity not connected to server (no recent connection attempts)"
                                }
                            } else {
                                # Unity is trying to connect - log but don't restart yet
                                try {
                                    if ($unityActualStatus.LastConnectionActivity -and $unityActualStatus.LastConnectionActivity -is [DateTime]) {
                                        $now = Get-Date
                                        $lastAttempt = $unityActualStatus.LastConnectionActivity
                                        # Ensure both are DateTime objects and in same timezone
                                        if ($lastAttempt -is [DateTime]) {
                                            $timeSinceAttempt = [Math]::Round(($now - $lastAttempt).TotalSeconds)
                                            # Only show time if it's positive (in the past)
                                            if ($timeSinceAttempt -ge 0) {
                                                $connectingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connecting to server (last attempt: ${timeSinceAttempt}s ago)"
                                                Write-ConsoleOutput -Message $connectingMsg -ForegroundColor "Yellow"
                                            } else {
                                                # Negative time means date parsing issue - just log without time
                                                $connectingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connecting to server"
                                                Write-ConsoleOutput -Message $connectingMsg -ForegroundColor "Yellow"
                                            }
                                        } else {
                                            $connectingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connecting to server"
                                            Write-ConsoleOutput -Message $connectingMsg -ForegroundColor "Yellow"
                                        }
                                    } else {
                                        $connectingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connecting to server"
                                        Write-ConsoleOutput -Message $connectingMsg -ForegroundColor "Yellow"
                                    }
                                } catch {
                                    # Date arithmetic failed - just log without time
                                    $connectingMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Connecting to server"
                                    Write-ConsoleOutput -Message $connectingMsg -ForegroundColor "Yellow"
                                }
                            }
                        }
                    } elseif ($config.simulation.enabled -and -not $unityActualStatus.InGameScene) {
                        # In simulation mode, if Unity is idle (not in game scene), restart it
                        $shouldRestart = $true
                        $restartReason = "Unity connected but not in game scene (simulation mode requires active gameplay)"
                    }
                } else {
                    # Server was just restarted and Unity is running - give Unity time to connect before restarting it
                    # This prevents the restart loop
                    # No need to calculate time remaining - we're already in the cooldown period
                }
                
                if ($shouldRestart) {
                    $unityRestartMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Restarting - $restartReason"
                    Write-ConsoleOutput -Message $unityRestartMsg -ForegroundColor "Cyan"
                    Restart-UnityIfNeeded | Out-Null
                }
            }
            
            $lastUnityCheck = $now
        }
        
        # Check simulation status from logs (every 5 seconds)
        $logWatcherStatus = Get-LogWatcherStatus
        $wasSimulationRunning = $stats.SimulationRunning
        
        # FIRST: Get server's ACTUAL simulation count (not stale log data) - non-blocking
        $serverActualCount = 0
        $serverHealthCheckSucceeded = $false
        try {
            $healthResult = Invoke-WebRequestAsync -Uri "$serverUrl/health" -Method GET -TimeoutSec 3 -JobTimeout 4
            if ($healthResult.Success) {
                $healthData = $healthResult.Content | ConvertFrom-Json
                $serverActualCount = $healthData.activeSimulations
                $serverHealthCheckSucceeded = $true
            } else {
                throw $healthResult.Error
            }
        } catch {
            # Health check failed - log the error but default to 0
            $healthErrorDetails = $_.Exception.Message
            if ($_.Exception.Response) {
                $healthErrorDetails += " (Status: $($_.Exception.Response.StatusCode))"
            }
            # Don't spam errors - only log once per minute
            if (-not $script:lastHealthCheckError -or ((Get-Date) - $script:lastHealthCheckError).TotalSeconds -gt 60) {
                $healthErrorMsg = "[$(Get-Date -Format 'HH:mm:ss')] WARNING: Health check failed - $healthErrorDetails"
                Write-ConsoleOutput -Message $healthErrorMsg -ForegroundColor "Yellow"
                $script:lastHealthCheckError = Get-Date
            }
            $serverActualCount = 0
            $serverHealthCheckSucceeded = $false
        }
        
        # ALWAYS use server's actual count - never use stale log watcher count
        # If server check failed, we defaulted to 0, which is correct (no server = no simulations)
        $logWatcherStatus.ActiveSimulations = $serverActualCount
        
        # Also check logs directly for simulation completion (10/10 games) - efficient read
        $simulationCompleted = $false
        if (Test-Path $logFile) {
            $recentLogs = @()
            try {
                $fileInfo = Get-Item $logFile -ErrorAction Stop
                $maxBytes = 200 * 200  # Assume ~200 bytes per line max
                $startPos = [Math]::Max(0, $fileInfo.Length - $maxBytes)
                $fileStream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $fileStream.Position = $startPos
                $reader = New-Object System.IO.StreamReader($fileStream)
                $recentLogs = ($reader.ReadToEnd() -split "`n") | Select-Object -Last 200
                $reader.Close()
                $fileStream.Close()
            } catch {
                # File read failed - continue with empty array
            }
            foreach ($line in $recentLogs) {
                # Check for simulation completion indicators
                if ($line -match 'Reached max games|maxGames.*reached|Game\s+10\s*/\s*10|10\s*/\s*10\s+games|simulation.*complete|stopping simulation') {
                    # Check timestamp - only if within last 30 seconds AND after monitor started
                    if ($line -match '\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]') {
                        try {
                            $lineTime = [DateTime]::Parse($matches[1])
                            $timeDiff = ((Get-Date) - $lineTime).TotalSeconds
                            # Only consider completion if:
                            # 1. Within last 30 seconds, AND
                            # 2. After monitor started, AND
                            # 3. After we started tracking a simulation (if we're tracking one)
                            $isAfterMonitorStart = $lineTime -gt $script:monitorStartTime
                            $isAfterSimStart = if ($script:simulationStartTime -ne $null) { $lineTime -gt $script:simulationStartTime } else { $true }
                            
                            if ($timeDiff -le 30 -and $isAfterMonitorStart -and $isAfterSimStart) {
                                $simulationCompleted = $true
                                break
                            }
                        } catch {
                            # If timestamp parsing fails, only assume recent if we're tracking a simulation
                            if ($script:simulationStartTime -ne $null) {
                                $simulationCompleted = $true
                                break
                            }
                        }
                    } else {
                        # No timestamp but matches pattern - only assume recent if we're tracking a simulation
                        if ($script:simulationStartTime -ne $null) {
                            $simulationCompleted = $true
                            break
                        }
                    }
                }
            }
        }
        
        # If simulation completed, mark as stopped
        if ($simulationCompleted) {
            $stats.SimulationRunning = $false
            $logWatcherStatus.ActiveSimulations = 0
            $serverActualCount = 0
        } else {
            # Only consider simulation "ACTIVE" if:
            # 1. Server reports active simulations, AND
            # 2. Unity is actually connected and in a game scene (receiving game updates)
            # If there's a simulation on the server but Unity isn't connected to it, treat it as inactive
            $serverHasSimulation = $serverActualCount -gt 0
            $unityActualStatus = Get-UnityActualStatus
            $unityIsInGame = $unityActualStatus.InGameScene -and $unityActualStatus.ReceivingGameUpdates
            
            # Check if simulation is active (both server and Unity agree)
            if ($serverHasSimulation -and $unityIsInGame) {
                $stats.SimulationRunning = $true
                
                # Track when we first detect a simulation starting (after monitor started)
                # This helps us distinguish between old simulations (running when monitor started) and new ones
                if ($script:simulationStartTime -eq $null) {
                    $script:simulationStartTime = Get-Date
                    $simStartTrackMsg = "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: Tracking new simulation (started after monitor)"
                    Write-ConsoleOutput -Message $simStartTrackMsg -ForegroundColor "Cyan"
                }
            } else {
                # Simulation not active - reset start time if it was set
                # This allows us to track the next simulation that starts
                if ($script:simulationStartTime -ne $null -and -not $stats.SimulationRunning) {
                    $script:simulationStartTime = $null
                }
            }
            
            # Check for orphaned simulation (server has it but Unity doesn't)
            
            # Only check for orphaned simulation if server ACTUALLY has simulations
            if ($serverActualCount -gt 0 -and -not $unityIsInGame) {
                $stats.SimulationRunning = $false
                
                # Don't check for orphaned simulations if server was just restarted (within last 60 seconds)
                # This prevents restart loops where we kill the server, restart it, then immediately kill it again
                $serverJustRestarted = $false
                if ($script:lastServerRestart -and $script:lastServerRestart -is [DateTime]) {
                    try {
                        $timeSinceServerRestart = (Get-Date) - $script:lastServerRestart
                        if ($timeSinceServerRestart.TotalSeconds -lt 60) {
                            $serverJustRestarted = $true
                        }
                    } catch {
                        # If date arithmetic fails, assume server wasn't just restarted
                        $serverJustRestarted = $false
                    }
                }
                
                # Throttle: only try to stop once per 10 seconds, and don't if server was just restarted
                if (-not $script:lastOrphanedSimStopAttempt -or -not ($script:lastOrphanedSimStopAttempt -is [DateTime])) {
                    $script:lastOrphanedSimStopAttempt = (Get-Date).AddSeconds(-15)
                }
                try {
                    $timeSinceLastStop = (Get-Date) - $script:lastOrphanedSimStopAttempt
                    $shouldStop = $timeSinceLastStop.TotalSeconds -ge 10 -and -not $serverJustRestarted
                } catch {
                    # If date arithmetic fails, reset and allow stop attempt
                    $script:lastOrphanedSimStopAttempt = (Get-Date).AddSeconds(-15)
                    $shouldStop = $true -and -not $serverJustRestarted
                }
                
                if ($serverJustRestarted) {
                    # Silently skip - server was just restarted, give it time to stabilize
                    continue
                }
                
                if ($shouldStop) {
                    $diagMsg = "[$(Get-Date -Format 'HH:mm:ss')] DIAGNOSTIC: Log watcher reports $($logWatcherStatus.ActiveSimulations) simulations, server /health reports $serverActualCount simulations"
                    Write-ConsoleOutput -Message $diagMsg -ForegroundColor "Cyan"
                    $orphanMsg = "[$(Get-Date -Format 'HH:mm:ss')] SIMULATION: Server has $serverActualCount active simulation(s) but Unity is NOT connected to it (orphaned simulation)"
                    Write-ConsoleOutput -Message $orphanMsg -ForegroundColor "Yellow"
                    
                    # Step 1: Try to stop via API FIRST (while server is still running) - non-blocking
                    $apiStopSucceeded = $false
                    try {
                        $stopApiMsg = "[$(Get-Date -Format 'HH:mm:ss')] Stopping orphaned simulation(s) via API (while server is running)..."
                        Write-ConsoleOutput -Message $stopApiMsg -ForegroundColor "Cyan"
                        $stopResultObj = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulations/stop-all" -Method POST -TimeoutSec 5 -JobTimeout 6
                        if ($stopResultObj.Success) {
                            $stopResult = $stopResultObj.Content | ConvertFrom-Json
                        } else {
                            throw $stopResultObj.Error
                        }
                        $apiDiagMsg = "[$(Get-Date -Format 'HH:mm:ss')] DIAGNOSTIC: API response - success: $($stopResult.success), stopped: $($stopResult.stopped), failed: $($stopResult.failed)"
                        Write-ConsoleOutput -Message $apiDiagMsg -ForegroundColor "Cyan"
                        if ($stopResult.success) {
                            if ($stopResult.stopped -gt 0) {
                                $apiStopSucceeded = $true
                                $stoppedMsg = "[$(Get-Date -Format 'HH:mm:ss')] Stopped $($stopResult.stopped) orphaned simulation(s) via API"
                                Write-ConsoleOutput -Message $stoppedMsg -ForegroundColor "Green"
                            } else {
                                $zeroStoppedMsg = "[$(Get-Date -Format 'HH:mm:ss')] API returned success but stopped 0 simulations - server may have already cleaned up"
                                Write-ConsoleOutput -Message $zeroStoppedMsg -ForegroundColor "Yellow"
                                $apiStopSucceeded = $true
                            }
                            if ($stopResult.failed -gt 0) {
                                $failedStopMsg = "[$(Get-Date -Format 'HH:mm:ss')] Failed to stop $($stopResult.failed) simulation(s)"
                                Write-ConsoleOutput -Message $failedStopMsg -ForegroundColor "Yellow"
                            }
                        }
                        if (-not $stopResult.success) {
                            $apiFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] API returned success=false: $($stopResult.error)"
                            Write-ConsoleOutput -Message $apiFailMsg -ForegroundColor "Yellow"
                        }
                        $script:lastOrphanedSimStopAttempt = Get-Date
                    } catch {
                        $apiErrorMsg = "[$(Get-Date -Format 'HH:mm:ss')] Could not stop orphaned simulations via API: $_"
                        Write-ConsoleOutput -Message $apiErrorMsg -ForegroundColor "Yellow"
                        $script:lastOrphanedSimStopAttempt = Get-Date
                    }
                    
                    # Step 2: If API failed, kill processes and restart server
                    if (-not $apiStopSucceeded) {
                        $killProcessMsg = "[$(Get-Date -Format 'HH:mm:ss')] API stop failed - killing processes on port 3000 and restarting server..."
                        Write-ConsoleOutput -Message $killProcessMsg -ForegroundColor "Cyan"
                        Kill-Port3000Processes
                        
                        # After killing processes, the server is likely dead - always restart it
                        # Note: Start-ServerIfNeeded will:
                        # 1. Kill port 3000 processes again (redundant but safe)
                        # 2. Verify port is free
                        # 3. Start server
                        # 4. WAIT for server to be ready (blocks up to 30 seconds)
                        # 5. Only then return, allowing other code to continue
                        $serverDeadMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server likely dead after killing processes - restarting and waiting for server to be ready..."
                        Write-ConsoleOutput -Message $serverDeadMsg -ForegroundColor "Cyan"
                        $serverRestartResult = Start-ServerIfNeeded
                        if ($serverRestartResult) {
                            $script:lastServerRestart = Get-Date  # Track server restart time to prevent restart loops
                            $serverRestartedMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server restarted and is ready - continuing with monitoring (cooldown: 60s)"
                            Write-ConsoleOutput -Message $serverRestartedMsg -ForegroundColor "Green"
                        } else {
                            $restartFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server restart may have failed - will retry on next check"
                            Write-ConsoleOutput -Message $restartFailMsg -ForegroundColor "Yellow"
                        }
                    }
                }
            }
            
            # No simulation on server
            if (-not $serverHasSimulation) {
                $stats.SimulationRunning = $false
            }
        }
        
        # Log simulation start/stop
        if ($stats.SimulationRunning -and -not $wasSimulationRunning) {
            $activeCount = $logWatcherStatus.ActiveSimulations
            $timestamp = Get-Date -Format 'HH:mm:ss'
            $simStartMsg = "[$timestamp] SIMULATION: Started - $activeCount active"
            Write-ConsoleOutput -Message $simStartMsg -ForegroundColor "Green"
        } elseif (-not $stats.SimulationRunning -and $wasSimulationRunning) {
            # Only show completion message if we actually tracked this simulation from the start
            # This prevents showing completion for old simulations that were running when monitor started
            if ($script:simulationEndTime -ne $null) {
                $timestamp = Get-Date -Format 'HH:mm:ss'
                $completedMsg = "[$timestamp] SIMULATION: Completed - 10/10 games - Unity is now idle"
                Write-ConsoleOutput -Message $completedMsg -ForegroundColor "Yellow"
            } else {
                # This was an old simulation - don't show completion, just continue
                $timestamp = Get-Date -Format 'HH:mm:ss'
                $oldSimMsg = "[$timestamp] SIMULATION: Old simulation ended (was running when monitor started) - continuing to monitor"
                Write-ConsoleOutput -Message $oldSimMsg -ForegroundColor "Gray"
                # Don't restart Unity for old simulations - just continue monitoring
                # Skip Unity restart logic for old simulations
                continue
            }
            
            # Only restart Unity if we actually tracked this simulation from the start
            # In simulation mode, if simulation ended and Unity is running but idle, restart it to start a new simulation
            if ($config.simulation.enabled -and $config.automation.autoRestartUnity -and $stats.UnityRunning) {
                $simCompleteRestartMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Simulation completed - restarting Unity to start new simulation..."
                Write-ConsoleOutput -Message $simCompleteRestartMsg -ForegroundColor "Cyan"
                $restartResult = Restart-UnityIfNeeded
                if ($restartResult) {
                    $unityRestartedMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Restarted - waiting for new simulation to start..."
                    Write-ConsoleOutput -Message $unityRestartedMsg -ForegroundColor "Green"
                } else {
                    $unityRestartFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Failed to restart after simulation completed"
                    Write-ConsoleOutput -Message $unityRestartFailMsg -ForegroundColor "Red"
                }
            } elseif ($config.simulation.enabled -and -not $stats.UnityRunning) {
                # Unity not running after simulation ended - restart it
                $unityNotRunningMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Simulation completed and Unity not running - restarting..."
                Write-ConsoleOutput -Message $unityNotRunningMsg -ForegroundColor "Cyan"
                Restart-UnityIfNeeded | Out-Null
            } elseif ($config.simulation.enabled) {
                # Simulation ended but Unity restart is disabled or Unity is not running
                $unityDisabledMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Simulation completed but Unity restart disabled or Unity not running"
                Write-ConsoleOutput -Message $unityDisabledMsg -ForegroundColor "Yellow"
            }
        }
        
        # In simulation mode, check if Unity is idle (running but no active simulation Unity is connected to)
        # This includes:
        # 1. No simulation on server at all
        # 2. Server has simulation but Unity isn't connected to it (orphaned simulation)
        if ($config.simulation.enabled -and $stats.UnityRunning -and -not $stats.SimulationRunning) {
            if (-not $script:simulationEndTime -or -not ($script:simulationEndTime -is [DateTime])) {
                $script:simulationEndTime = Get-Date
            }
            try {
                $timeSinceSimEnd = (Get-Date) - $script:simulationEndTime
            } catch {
                # If date arithmetic fails, reset the timer
                $script:simulationEndTime = Get-Date
                $timeSinceSimEnd = New-TimeSpan -Seconds 0
            }
            if ($timeSinceSimEnd.TotalSeconds -gt 30) {
                $reason = if ($logWatcherStatus.ActiveSimulations -gt 0) {
                    "orphaned simulation (server has simulation but Unity not connected)"
                } else {
                    "no active simulation"
                }
                
                # If there's an orphaned simulation, stop it before restarting Unity
                if ($logWatcherStatus.ActiveSimulations -gt 0) {
                    # Step 1: Try to stop via API FIRST (while server is still running) - non-blocking
                    $apiStopSucceeded = $false
                    try {
                        $stopOrphanMsg = "[$(Get-Date -Format 'HH:mm:ss')] Stopping orphaned simulation(s) via API (while server is running)..."
                        Write-ConsoleOutput -Message $stopOrphanMsg -ForegroundColor "Cyan"
                        $stopResultObj = Invoke-WebRequestAsync -Uri "$serverUrl/api/simulations/stop-all" -Method POST -TimeoutSec 5 -JobTimeout 6
                        if ($stopResultObj.Success) {
                            $stopResult = $stopResultObj.Content | ConvertFrom-Json
                        } else {
                            throw $stopResultObj.Error
                        }
                        if ($stopResult.success -and $stopResult.stopped -gt 0) {
                            $apiStopSucceeded = $true
                            $stoppedOrphanMsg = "[$(Get-Date -Format 'HH:mm:ss')] Stopped $($stopResult.stopped) orphaned simulation(s) via API"
                            Write-ConsoleOutput -Message $stoppedOrphanMsg -ForegroundColor "Green"
                        }
                    } catch {
                        $orphanApiFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Could not stop orphaned simulation via API: $_"
                        Write-ConsoleOutput -Message $orphanApiFailMsg -ForegroundColor "Yellow"
                    }
                    
                    # Step 2: If API failed, kill processes and restart server
                    # BUT: Don't kill if server was just restarted (within last 60 seconds)
                    $serverJustRestarted = $false
                    if ($script:lastServerRestart -and $script:lastServerRestart -is [DateTime]) {
                        try {
                            $timeSinceServerRestart = (Get-Date) - $script:lastServerRestart
                            if ($timeSinceServerRestart.TotalSeconds -lt 60) {
                                $serverJustRestarted = $true
                            }
                        } catch {
                            $serverJustRestarted = $false
                        }
                    }
                    
                    if (-not $apiStopSucceeded -and -not $serverJustRestarted) {
                        $apiStopFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] API stop failed - killing processes on port 3000 and restarting server..."
                        Write-ConsoleOutput -Message $apiStopFailMsg -ForegroundColor "Cyan"
                        Kill-Port3000Processes
                        
                        # If server is dead, restart it before restarting Unity
                        # Note: Start-ServerIfNeeded will kill port 3000 processes again (redundant but safe),
                        # then verify port is free, then start server and wait for it to be ready (up to 30 seconds)
                        if (-not (Test-ServerRunning)) {
                            $serverDeadBeforeUnityMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server appears dead after killing processes - restarting server before Unity..."
                            Write-ConsoleOutput -Message $serverDeadBeforeUnityMsg -ForegroundColor "Cyan"
                            $serverRestartResult = Start-ServerIfNeeded
                            if ($serverRestartResult) {
                                $script:lastServerRestart = Get-Date  # Track server restart time to prevent restart loops
                                $serverRestartSuccessMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server restarted successfully - Unity will connect shortly (cooldown: 60s)"
                                Write-ConsoleOutput -Message $serverRestartSuccessMsg -ForegroundColor "Green"
                            } else {
                                $serverRestartFailMsg = "[$(Get-Date -Format 'HH:mm:ss')] Server restart may have failed - Unity may fail to connect"
                                Write-ConsoleOutput -Message $serverRestartFailMsg -ForegroundColor "Yellow"
                            }
                        }
                    } elseif ($serverJustRestarted) {
                        $cooldownMsg = "[$(Get-Date -Format 'HH:mm:ss')] Skipping server kill/restart - server was just restarted (cooldown active)"
                        Write-ConsoleOutput -Message $cooldownMsg -ForegroundColor "Gray"
                    }
                }
                
                $idleTime = [math]::Round($timeSinceSimEnd.TotalSeconds)
                $unityIdleMsg = "[$(Get-Date -Format 'HH:mm:ss')] UNITY: Idle for ${idleTime}s - $reason - restarting..."
                Write-ConsoleOutput -Message $unityIdleMsg -ForegroundColor "Yellow"
                $script:simulationEndTime = $null  # Reset timer
                Restart-UnityIfNeeded | Out-Null
            }
        } else {
            # Reset timer if simulation is running (Unity is connected) or Unity is not running
            $script:simulationEndTime = $null
        }
        
        # Check server status continuously and restart if needed (every 5 seconds)
        # BUT: Don't check if server was just restarted (within last 60 seconds) to prevent restart loops
        $serverCheckInterval = 5  # Check server every 5 seconds
        
        # Check if server was just restarted (cooldown period)
        $serverJustRestarted = $false
        if ($script:lastServerRestart -and $script:lastServerRestart -is [DateTime]) {
            try {
                $timeSinceServerRestart = (Get-Date) - $script:lastServerRestart
                if ($timeSinceServerRestart.TotalSeconds -lt 60) {
                    $serverJustRestarted = $true
                }
            } catch {
                $serverJustRestarted = $false
            }
        }
        
        # Check server health every 5 seconds (independent of stats display)
        # BUT: Skip check if server was just restarted (within cooldown period)
        if (($now - $lastServerCheck).TotalSeconds -ge $serverCheckInterval) {
            if (-not $serverJustRestarted) {
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
            } else {
                # Server was just restarted - skip health check during cooldown
                # This prevents killing the server while it's still starting up
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
                    # Use non-blocking async call
                    $nodeResult = Invoke-NodeAsync -ScriptPath $nodeScript -Arguments @("--exit-focus") -JobTimeout 5
                    $result = if ($nodeResult.Output) { $nodeResult.Output } else { "" }
                    if ($nodeResult.Success -and $nodeResult.ExitCode -eq 0) {
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
        # CRITICAL: Sync with Update-MonitorStatus timer to avoid reading stale data
        # Update every 5 seconds (reduced from 10 for more responsive display)
        # BUT: Don't update if we just wrote console output (prevents flashing)
        # Only update if console output line hasn't changed recently (reduced to 1 second for faster updates)
        $timeSinceLastConsoleOutput = if ($script:lastConsoleOutputTime) { ($now - $script:lastConsoleOutputTime).TotalSeconds } else { 999 }
        # SYNC FIX: Wait at least 0.5s after status update to ensure file is written, then check our own timer
        $timeSinceStatusUpdate = if ($lastStatusUpdate) { ($now - $lastStatusUpdate).TotalSeconds } else { 999 }
        if (($timeSinceStatusUpdate -ge 0.5 -and ($now - $lastStatsUpdate).TotalSeconds -ge 5) -and $timeSinceLastConsoleOutput -gt 1) {
            Show-Statistics
            $lastStatsUpdate = $now
        }
    } catch {
        # Main catch for try block at line 3487 (while loop main try)
        $errorMsg = $_.ToString()
        $errorException = $_.Exception.Message
        $errorStackTrace = $_.ScriptStackTrace
        
        # Check if this is a console handle error (non-interactive context)
        $isConsoleHandleError = $errorMsg -match "handle is invalid|The handle is invalid|Console handle"
        
        # Extract the actual error message (not just "Monitoring error: ...")
        $actualError = if ($errorException) { $errorException } else { $errorMsg }
        
        # Only write to console if we have an interactive console AND it's not a console handle error
        if ((Test-InteractiveConsole) -and -not $isConsoleHandleError) {
            Write-Error "Monitoring error: $actualError"
        }
        
        # CRITICAL: Log error to diagnostics file so we can see what's blocking the loop
        # But skip console handle errors in non-interactive contexts (they're expected)
        if (-not $isConsoleHandleError) {
            try {
                $diagnosticsLog = Join-Path $script:projectRoot "logs\monitor-diagnostics.log"
                $errorLogEntry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ERROR] Monitoring error: $actualError`nStack trace: $errorStackTrace`n"
                Add-Content -Path $diagnosticsLog -Value $errorLogEntry -ErrorAction SilentlyContinue
            } catch {
                # If logging fails and we have interactive console, try to write to console
                if (Test-InteractiveConsole) {
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] CRITICAL: Failed to log error to diagnostics: $_" -ForegroundColor "Red" -ErrorAction SilentlyContinue
                }
            }
            # Update status file with error (only if not a console handle error)
            # Use actual error message, not generic "Monitoring error"
            Update-MonitorStatus -statusUpdate @{
                lastError = $actualError
                lastErrorTime = (Get-Date).ToUniversalTime().ToString("o")
            } -ErrorAction SilentlyContinue
        }
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Info "Monitoring stopped"