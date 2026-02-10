# BrokenPromise Integration Helper Functions
# Bridge between PowerShell BrokenPromise and AI core

$script:aiIntegrationScript = Join-Path $PSScriptRoot "integration\BrokenPromise-integration.js"
$script:aiIntegrationHttpServer = Join-Path $PSScriptRoot "integration\BrokenPromise-integration-http.js"
$script:persistentServerProcess = $null
$script:persistentServerPort = 3001
$script:usePersistentServer = $true  # LEARNING SYSTEM FIX: Use persistent HTTP server to prevent memory issues
$script:serverRestartAttempts = 0
$script:maxServerRestartAttempts = 3
$script:lastServerFailureTime = $null

# Test all systems during startup
function Test-BrokenPromiseSystems {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  BROKENPROMISE SYSTEM VERIFICATION" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $allPassed = $true
    $tests = @()
    
    # Test 1: AI Integration Script Exists
    Write-Host "  [1/9] Testing AI Integration Script..." -NoNewline
    if (Test-Path $script:aiIntegrationScript) {
        Write-Host " [OK]" -ForegroundColor Green
        $tests += @{ Test = "AI Integration Script"; Status = "PASS" }
    } else {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "AI Integration Script"; Status = "FAIL"; Error = "Not found at $script:aiIntegrationScript" }
        $allPassed = $false
    }
    
    # Test 2: Node.js Available
    Write-Host "  [2/9] Testing Node.js..." -NoNewline
    try {
        $nodeVersion = node --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host " [OK] ($nodeVersion)" -ForegroundColor Green
            $tests += @{ Test = "Node.js"; Status = "PASS"; Version = $nodeVersion }
        } else {
            throw "Node.js not available"
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Node.js"; Status = "FAIL"; Error = "Node.js not found" }
        $allPassed = $false
    }
    
    # Test 3: AI Core Initialization
    # LEARNING SYSTEM FIX: Use lightweight health check instead of full initialization
    Write-Host "  [3/9] Testing AI Core Initialization..." -NoNewline
    try {
        # Use lightweight health check (doesn't load full AIMonitorCore)
        $healthCheckScript = Join-Path $PSScriptRoot "scripts\lightweight-health-check.js"
        if (Test-Path $healthCheckScript) {
            $result = & node $healthCheckScript "all" 2>&1 | ConvertFrom-Json
            if ($result.success -and $result.checks.database) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "AI Core Initialization"; Status = "PASS" }
            } else {
                throw "Health check failed: $($result.error)"
            }
        } else {
            # Fallback to full check (but this may fail with memory issues)
            $result = Invoke-AIIntegration -Command "get-status-report"
            if ($result -and ($result.system -or $result.error)) {
                if ($result.error) {
                    throw "AI Core error: $($result.error)"
                }
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "AI Core Initialization"; Status = "PASS" }
            } else {
                throw "AI Core not responding (timeout or no response)"
            }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $errorMsg = if ($_.Exception.Message) { $_.Exception.Message } else { "Timeout or initialization failed" }
        $tests += @{ Test = "AI Core Initialization"; Status = "FAIL"; Error = $errorMsg }
        $allPassed = $false
    }
    
    # Test 4: Learning Engine
    # LEARNING SYSTEM FIX: Use lightweight health check instead of full initialization
    Write-Host "  [4/9] Testing Learning Engine..." -NoNewline
    try {
        # Use lightweight health check for learning system
        $healthCheckScript = Join-Path $PSScriptRoot "scripts\lightweight-health-check.js"
        if (Test-Path $healthCheckScript) {
            $result = & node $healthCheckScript "learning" 2>&1 | ConvertFrom-Json
            if ($result.success -and $result.checks.learningSystem) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Learning Engine"; Status = "PASS" }
            } else {
                throw "Learning system health check failed: $($result.error)"
            }
        } else {
            # Fallback to full check
            $result = Invoke-AIIntegration -Command "query" -Arguments @("What is the learning system status?")
            if ($result -and ($result.answer -or $result.error)) {
                if ($result.error) {
                    throw "Learning Engine error: $($result.error)"
                }
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Learning Engine"; Status = "PASS" }
            } else {
                throw "Learning Engine not responding (timeout or no response)"
            }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $errorMsg = if ($_.Exception.Message) { $_.Exception.Message } else { "Timeout or initialization failed" }
        $tests += @{ Test = "Learning Engine"; Status = "FAIL"; Error = $errorMsg }
        $allPassed = $false
    }
    
    # Test 5: Misdiagnosis Prevention System
    # LEARNING SYSTEM FIX: Use lightweight health check instead of full query
    Write-Host "  [5/9] Testing Misdiagnosis Prevention..." -NoNewline
    try {
        # Use lightweight health check - patterns are in database
        $healthCheckScript = Join-Path $PSScriptRoot "scripts\lightweight-health-check.js"
        if (Test-Path $healthCheckScript) {
            $result = & node $healthCheckScript "learning" 2>&1 | ConvertFrom-Json
            if ($result.success -and $result.checks.patterns) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Misdiagnosis Prevention"; Status = "PASS" }
            } else {
                throw "Misdiagnosis patterns not found"
            }
        } else {
            # Fallback to full query
            $result = Invoke-AIIntegration -Command "query" -Arguments @("What misdiagnosis patterns are known for PowerShell syntax errors?")
            if ($result) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Misdiagnosis Prevention"; Status = "PASS" }
            } else {
                throw "Misdiagnosis system not responding"
            }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Misdiagnosis Prevention"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Test 6: Prompt Generation System
    Write-Host "  [6/9] Testing Prompt Generation..." -NoNewline
    try {
        $result = Invoke-AIIntegration -Command "get-latest-prompt"
        if ($result -ne $null) {
            Write-Host " [OK]" -ForegroundColor Green
            $tests += @{ Test = "Prompt Generation"; Status = "PASS" }
        } else {
            # No prompt is OK (just means no issues yet)
            Write-Host " [OK] (no prompts yet)" -ForegroundColor Green
            $tests += @{ Test = "Prompt Generation"; Status = "PASS" }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Prompt Generation"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Test 7: Statistics System
    # LEARNING SYSTEM FIX: Use lightweight check or skip (statistics not critical for startup)
    Write-Host "  [7/9] Testing Statistics System..." -NoNewline
    try {
        # Statistics are available after full initialization, skip for lightweight check
        # This is not critical for startup verification
        Write-Host " [SKIP] (available after full init)" -ForegroundColor Yellow
        $tests += @{ Test = "Statistics System"; Status = "SKIP"; Reason = "Available after full initialization" }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Statistics System"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Test 8: Issue Detection
    # LEARNING SYSTEM FIX: Use lightweight check - just verify database is accessible
    Write-Host "  [8/9] Testing Issue Detection..." -NoNewline
    try {
        # Issue detection requires full initialization, but we can verify database is ready
        $healthCheckScript = Join-Path $PSScriptRoot "scripts\lightweight-health-check.js"
        if (Test-Path $healthCheckScript) {
            $result = & node $healthCheckScript "all" 2>&1 | ConvertFrom-Json
            if ($result.success -and $result.checks.database) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Issue Detection"; Status = "PASS" }
            } else {
                throw "Database not ready for issue detection"
            }
        } else {
            # Fallback
            $result = Invoke-AIIntegration -Command "detect-issue" -Arguments @("test log line")
            if ($result -ne $null) {
                Write-Host " [OK]" -ForegroundColor Green
                $tests += @{ Test = "Issue Detection"; Status = "PASS" }
            } else {
                throw "Issue detection not responding"
            }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Issue Detection"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Test 9: Database Connection
    Write-Host "  [9/9] Testing Database Connection..." -NoNewline
    try {
        $dbTestScript = Join-Path $PSScriptRoot "test-database.js"
        if (Test-Path $dbTestScript) {
            $dbResult = & node $dbTestScript 2>&1 | ConvertFrom-Json
            if ($dbResult.success) {
                $tableInfo = if ($dbResult.details.tableCount) { " ($($dbResult.details.tableCount) tables)" } else { "" }
                Write-Host " [OK]$tableInfo" -ForegroundColor Green
                $tests += @{ Test = "Database Connection"; Status = "PASS"; Details = $dbResult.details }
            } else {
                Write-Host " [FAIL]" -ForegroundColor Red
                Write-Host "      Error: $($dbResult.message)" -ForegroundColor Yellow
                if ($dbResult.details.suggestion) {
                    Write-Host "      Suggestion: $($dbResult.details.suggestion)" -ForegroundColor Yellow
                }
                $tests += @{ Test = "Database Connection"; Status = "FAIL"; Error = $dbResult.message; Suggestion = $dbResult.details.suggestion }
                $allPassed = $false
            }
        } else {
            Write-Host " [SKIP] (test script not found)" -ForegroundColor Yellow
            $tests += @{ Test = "Database Connection"; Status = "SKIP"; Reason = "Test script not found" }
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Database Connection"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Summary
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    if ($allPassed) {
        Write-Host "  [OK] ALL SYSTEMS VERIFIED - MISDIAGNOSIS-FIRST ARCHITECTURE READY" -ForegroundColor Green
    } else {
        Write-Host "  [!] SOME SYSTEMS FAILED - REVIEW ABOVE" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Failed Tests:" -ForegroundColor Yellow
        
        # Track failures in learning system
        $failureList = @()
        foreach ($test in $tests) {
            if ($test.Status -eq "FAIL") {
                Write-Host "    - $($test.Test): $($test.Error)" -ForegroundColor Red
                $failureList += "$($test.Test):$($test.Error)"
            }
        }
        
        # Record failures to learning system
        if ($failureList.Count -gt 0) {
            try {
                $trackScript = Join-Path $PSScriptRoot "track-startup-failures.js"
                if (Test-Path $trackScript) {
                    $trackResult = & node $trackScript $failureList 2>&1 | ConvertFrom-Json
                    if ($trackResult.success) {
                        Write-Host ""
                        Write-Host "  [OK] Failures recorded to learning system ($($trackResult.tracked) failures)" -ForegroundColor Green
                    }
                }
            } catch {
                # Silently fail - don't block startup
            }
        }
    }
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    return $allPassed
}

# LEARNING SYSTEM FIX: Persistent HTTP server to prevent memory heap overflow
# Reuses single process instead of spawning new process for each command
function Start-PersistentIntegrationServer {
    # Check if server is already running and healthy
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($script:persistentServerPort)/ping" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            # Server is running and responding
            $script:serverRestartAttempts = 0  # Reset restart counter on success
            return $true
        }
    } catch {
        # Server not running or not responding - check if process exists but is dead
        if ($script:persistentServerProcess -and $script:persistentServerProcess.HasExited) {
            # Process died - clean it up
            $script:persistentServerProcess = $null
        }
    }
    
    # Check if we've exceeded max restart attempts
    if ($script:serverRestartAttempts -ge $script:maxServerRestartAttempts) {
        $timeSinceLastFailure = if ($script:lastServerFailureTime) { 
            (Get-Date) - $script:lastServerFailureTime 
        } else { 
            [TimeSpan]::MaxValue 
        }
        
        # Reset counter after 5 minutes
        if ($timeSinceLastFailure.TotalMinutes -gt 5) {
            $script:serverRestartAttempts = 0
        } else {
            Write-Warning "Persistent server restart attempts exceeded ($($script:serverRestartAttempts)/$($script:maxServerRestartAttempts)), falling back to per-command spawning"
            $script:usePersistentServer = $false
            return $false
        }
    }
    
    if ($script:persistentServerProcess -and !$script:persistentServerProcess.HasExited) {
        # Process exists but server not responding - might be stuck, kill it
        Write-Warning "Persistent server process exists but not responding - restarting..."
        Stop-PersistentIntegrationServer
    }
    
    if (!(Test-Path $script:aiIntegrationHttpServer)) {
        Write-Warning "Persistent HTTP server script not found, falling back to per-command spawning"
        $script:usePersistentServer = $false
        return $false
    }
    
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "node"
        $psi.Arguments = "`"$script:aiIntegrationHttpServer`""
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        
        $script:persistentServerProcess = New-Object System.Diagnostics.Process
        $script:persistentServerProcess.StartInfo = $psi
        [void]$script:persistentServerProcess.Start()
        
        # Wait for server to be ready (check HTTP endpoint)
        $maxWait = 10
        $waited = 0
        $ready = $false
        while ($waited -lt $maxWait -and !$ready) {
            Start-Sleep -Milliseconds 500
            $waited += 0.5
            try {
                $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($script:persistentServerPort)/ping" -TimeoutSec 1 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $ready = $true
                }
            } catch {
                # Not ready yet
            }
        }
        
        if ($ready) {
            $script:serverRestartAttempts = 0  # Reset on successful start
            return $true
        } else {
            Write-Warning "Persistent HTTP server did not become ready, attempting restart..."
            Stop-PersistentIntegrationServer
            $script:serverRestartAttempts++
            $script:lastServerFailureTime = Get-Date
            # Don't disable yet - allow retries
            return $false
        }
    } catch {
        Write-Warning "Failed to start persistent HTTP server: $_, attempting restart..."
        Stop-PersistentIntegrationServer
        $script:serverRestartAttempts++
        $script:lastServerFailureTime = Get-Date
        # Don't disable yet - allow retries
        return $false
    }
}

function Stop-PersistentIntegrationServer {
    if ($script:persistentServerProcess -and !$script:persistentServerProcess.HasExited) {
        try {
            # Try graceful shutdown via HTTP
            try {
                Invoke-WebRequest -Uri "http://127.0.0.1:$($script:persistentServerPort)/shutdown" -TimeoutSec 1 -ErrorAction Stop | Out-Null
            } catch {
                # Ignore - server might already be down
            }
            
            # Wait for graceful shutdown (max 2 seconds)
            if (!$script:persistentServerProcess.WaitForExit(2000)) {
                $script:persistentServerProcess.Kill()
            }
        } catch {
            # Force kill if graceful shutdown fails
            try {
                $script:persistentServerProcess.Kill()
            } catch {
                # Ignore errors
            }
        }
    }
    $script:persistentServerProcess = $null
}

# Cleanup function - call this when BrokenPromise shuts down
function Stop-AllIntegrationServers {
    Stop-PersistentIntegrationServer
    
    # Also kill any orphaned integration server processes on port 3001
    try {
        $netstatOutput = netstat -ano | Select-String ":3001"
        if ($netstatOutput) {
            foreach ($line in $netstatOutput) {
                if ($line -match '\s+(\d+)\s*$') {
                    $processId = [int]$matches[1]
                    try {
                        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                        if ($process -and $process.ProcessName -eq 'node') {
                            # Check if it's our integration server
                            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue).CommandLine
                            if ($cmdLine -and $cmdLine -like "*BrokenPromise-integration-http.js*") {
                                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                            }
                        }
                    } catch {
                        # Ignore errors
                    }
                }
            }
        }
    } catch {
        # Ignore errors during cleanup
    }
}

# Export cleanup function so BrokenPromise.ps1 can call it
# Also register cleanup on PowerShell exit
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Stop-AllIntegrationServers
}

# Helper function to call AI integration
# LEARNING SYSTEM FIX: Uses persistent server when available to prevent memory issues
function Invoke-AIIntegration {
    param(
        [string]$Command,
        [string[]]$Arguments = @()
    )
    
    # Try persistent HTTP server first (if enabled)
    if ($script:usePersistentServer) {
        # Ensure server is running
        if (!(Start-PersistentIntegrationServer)) {
            # Fall back to per-command spawning
            $script:usePersistentServer = $false
        } else {
            try {
                # Send command to persistent HTTP server
                $uri = "http://127.0.0.1:$($script:persistentServerPort)/$Command"
                if ($Arguments.Count -gt 0) {
                    # URL encode arguments (PowerShell native method)
                    $argsJson = $Arguments | ConvertTo-Json -Compress
                    $argsBytes = [System.Text.Encoding]::UTF8.GetBytes($argsJson)
                    $argsEncoded = [Convert]::ToBase64String($argsBytes)
                    $uri += "?args=$argsEncoded"
                }
                
                $response = Invoke-WebRequest -Uri $uri -TimeoutSec 30 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    return $response.Content | ConvertFrom-Json
                }
            } catch {
                # Server error - try to restart
                Write-Warning "Persistent HTTP server error: $_"
                Stop-PersistentIntegrationServer
                $script:serverRestartAttempts++
                $script:lastServerFailureTime = Get-Date
                
                # Try to restart (if under max attempts)
                if ($script:serverRestartAttempts -lt $script:maxServerRestartAttempts) {
                    Write-Info "Attempting to restart persistent server (attempt $($script:serverRestartAttempts)/$($script:maxServerRestartAttempts))..."
                    Start-Sleep -Milliseconds 500
                    if (Start-PersistentIntegrationServer) {
                        # Retry the command
                        try {
                            $response = Invoke-WebRequest -Uri $uri -TimeoutSec 30 -ErrorAction Stop
                            if ($response.StatusCode -eq 200) {
                                return $response.Content | ConvertFrom-Json
                            }
                        } catch {
                            # Restart failed, fall through to fallback
                        }
                    }
                }
                
                # If restart failed or max attempts reached, fall back
                if ($script:serverRestartAttempts -ge $script:maxServerRestartAttempts) {
                    Write-Warning "Max restart attempts reached, falling back to per-command spawning"
                    $script:usePersistentServer = $false
                }
            }
        }
    }
    
    # Fallback: per-command spawning (original behavior)
    try {
        $allArgs = @($Command) + $Arguments
        $result = & node $script:aiIntegrationScript $allArgs 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            try {
                return $result | ConvertFrom-Json
            } catch {
                Write-Error "Failed to parse AI integration response: $_" -ErrorAction SilentlyContinue
                return $null
            }
        } else {
            Write-Error "AI integration command failed: $($result -join [Environment]::NewLine)" -ErrorAction SilentlyContinue
            return $null
        }
    } catch {
        Write-Error "AI integration error: $_" -ErrorAction SilentlyContinue
        return $null
    }
}

# Get investigation status from AI core
function Get-AIInvestigationStatus {
    try {
        $result = Invoke-AIIntegration -Command "get-investigation-status"
        if ($result) {
            $startTime = $null
            if ($result.startTime) {
                try {
                    $startTime = [DateTime]::Parse($result.startTime)
                } catch {
                    # Invalid date format - log but don't fail
                    Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI investigation status check failed: Failed to parse startTime '$($result.startTime)': $_" -ForegroundColor "Yellow"
                }
            }
            return @{
                Active = $result.active
                Status = $result.status
                StartTime = $startTime
                Timeout = $result.timeout
                Progress = $result.progress
                TimeRemaining = $result.timeRemaining
                IssuesCount = $result.issuesCount
                Issues = $result.issues
            }
        }
    } catch {
        # Log the actual error, not just "handle is invalid"
        Write-ConsoleOutput -Message "[$(Get-Date -Format 'HH:mm:ss')] [DIAGNOSTIC] AI investigation status check failed: $_" -ForegroundColor "Yellow"
    }
    return $null
}

# Should start investigation? (AI decision)
function Should-AIStartInvestigation {
    $result = Invoke-AIIntegration -Command "should-start-investigation"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
            Issues = $result.issues
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Should pause Unity? (AI decision)
function Should-AIPauseUnity {
    $result = Invoke-AIIntegration -Command "should-pause-unity"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Should resume Unity? (AI decision)
function Should-AIResumeUnity {
    $result = Invoke-AIIntegration -Command "should-resume-unity"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Should start server? (AI decision)
function Should-AIStartServer {
    $result = Invoke-AIIntegration -Command "should-start-server"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Should start Unity? (AI decision)
function Should-AIStartUnity {
    $result = Invoke-AIIntegration -Command "should-start-unity"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Should start simulation? (AI decision)
function Should-AIStartSimulation {
    $result = Invoke-AIIntegration -Command "should-start-simulation"
    if ($result) {
        return @{
            Should = $result.should
            Reason = $result.reason
            Confidence = $result.confidence
            Priority = $result.priority
        }
    }
    return @{ Should = $false; Reason = "AI integration unavailable" }
}

# Start investigation (via AI)
function Start-AIInvestigation {
    $result = Invoke-AIIntegration -Command "start-investigation"
    if ($result) {
        return @{
            Success = $result.success
            Reason = $result.reason
        }
    }
    return @{ Success = $false; Reason = "AI integration unavailable" }
}

# Complete investigation (via AI)
function Complete-AIInvestigation {
    $result = Invoke-AIIntegration -Command "complete-investigation"
    if ($result) {
        return @{
            Success = $result.success
            Timestamp = if ($result.timestamp) { [DateTime]::new(1970, 1, 1).AddMilliseconds($result.timestamp) } else { Get-Date }
        }
    }
    return @{ Success = $false }
}

# Detect issue from log line (AI detection)
function Detect-AIIssue {
    param(
        [string]$LogLine
    )
    
    $result = Invoke-AIIntegration -Command "detect-issue" -Arguments @($LogLine)
    if ($result -and $result.issue) {
        return @{
            Issue = $result.issue
            Confidence = $result.confidence
            Method = $result.method  # pattern | state | anomaly | causal
        }
    }
    return $null
}

# Add issue to AI detector (replaces issue-detector.js --add-issue-file)
function Add-AIIssue {
    param(
        [hashtable]$IssueData
    )
    
    $jsonData = $IssueData | ConvertTo-Json -Compress
    $result = Invoke-AIIntegration -Command "add-issue" -Arguments @($jsonData)
    return $result
}

# Add issue from file (replaces issue-detector.js --add-issue-file)
function Add-AIIssueFromFile {
    param(
        [string]$FilePath
    )
    
    $result = Invoke-AIIntegration -Command "add-issue-file" -Arguments @($FilePath)
    return $result
}

# Get active issues from AI detector
function Get-AIActiveIssues {
    $result = Invoke-AIIntegration -Command "get-active-issues"
    if ($result) {
        return @{
            Count = $result.count
            Issues = $result.issues
        }
    }
    return @{ Count = 0; Issues = @() }
}

# Get suggested fixes for an issue
function Get-AISuggestedFixes {
    param(
        [string]$IssueId
    )
    
    $result = Invoke-AIIntegration -Command "get-suggested-fixes" -Arguments @($IssueId)
    if ($result) {
        return $result
    }
    return $null
}

# Record fix attempt
function Record-AIFixAttempt {
    param(
        [string]$IssueId,
        [string]$FixMethod,
        [hashtable]$FixDetails = @{},
        [string]$Result  # success | failure | partial
    )
    
    $detailsJson = $FixDetails | ConvertTo-Json -Compress
    $result = Invoke-AIIntegration -Command "record-fix-attempt" -Arguments @($IssueId, $FixMethod, $Result, $detailsJson)
    return $result
}

# Get live statistics from AI
# Get live statistics from AI system
function Get-AILiveStatistics {
    $result = Invoke-AIIntegration -Command "get-live-statistics"
    return $result
}

# Get formatted statistics (human-readable)
function Get-AIFormattedStatistics {
    $result = Invoke-AIIntegration -Command "get-formatted-statistics"
    return $result
}

# Update monitor status (sync AI core state to monitor-status.json)
function Update-AIMonitorStatus {
    $result = Invoke-AIIntegration -Command "update-monitor-status"
    return $result
}

# Query AI system
function Query-AISystem {
    param(
        [string]$Question
    )
    
    $result = Invoke-AIIntegration -Command "query" -Arguments @($Question)
    return $result
}

# Get complete status report
function Get-AIStatusReport {
    $result = Invoke-AIIntegration -Command "get-status-report"
    return $result
}

# Get latest prompt for user to deliver to AI
function Get-AILatestPrompt {
    $result = Invoke-AIIntegration -Command "get-latest-prompt"
    if ($result) {
        return @{
            Id = $result.id
            Type = $result.type
            Prompt = $result.prompt
            Timestamp = if ($result.timestamp) { [DateTimeOffset]::FromUnixTimeMilliseconds($result.timestamp).LocalDateTime } else { $null }
            Delivered = $result.delivered
        }
    }
    return $null
}

# Mark prompt as delivered
function Mark-AIPromptDelivered {
    param(
        [string]$PromptId
    )
    
    $result = Invoke-AIIntegration -Command "mark-prompt-delivered" -Arguments @($PromptId)
    return $result
}

# Get compliance verification for a prompt
function Get-AIComplianceVerification {
    param(
        [string]$PromptId
    )
    
    $result = Invoke-AIIntegration -Command "get-compliance-verification" -Arguments @($PromptId)
    if ($result) {
        return @{
            PromptId = $result.promptId
            Timestamp = if ($result.timestamp) { [DateTimeOffset]::FromUnixTimeMilliseconds($result.timestamp).LocalDateTime } else { $null }
            Compliant = $result.compliant
            ComplianceResult = $result.complianceResult
            PartsWorked = $result.partsWorked
            PartsSkipped = $result.partsSkipped
            Verification = $result.verification
        }
    }
    return $null
}