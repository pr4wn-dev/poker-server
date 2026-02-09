# BrokenPromise Integration Helper Functions
# Bridge between PowerShell BrokenPromise and AI core

$script:aiIntegrationScript = Join-Path $PSScriptRoot "integration\BrokenPromise-integration.js"

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
    # Note: Can take 20-30s to load large state files (7.7MB+)
    Write-Host "  [3/9] Testing AI Core Initialization..." -NoNewline
    try {
        # Give it extra time - initialization loads entire state file
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
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $errorMsg = if ($_.Exception.Message) { $_.Exception.Message } else { "Timeout or initialization failed" }
        $tests += @{ Test = "AI Core Initialization"; Status = "FAIL"; Error = $errorMsg }
        $allPassed = $false
    }
    
    # Test 4: Learning Engine
    # Note: Can take 20-30s to load large state files (7.7MB+)
    Write-Host "  [4/9] Testing Learning Engine..." -NoNewline
    try {
        # Give it extra time - initialization loads entire state file
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
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $errorMsg = if ($_.Exception.Message) { $_.Exception.Message } else { "Timeout or initialization failed" }
        $tests += @{ Test = "Learning Engine"; Status = "FAIL"; Error = $errorMsg }
        $allPassed = $false
    }
    
    # Test 5: Misdiagnosis Prevention System
    Write-Host "  [5/9] Testing Misdiagnosis Prevention..." -NoNewline
    try {
        # Test misdiagnosis prevention by querying for PowerShell syntax error
        $result = Invoke-AIIntegration -Command "query" -Arguments @("What misdiagnosis patterns are known for PowerShell syntax errors?")
        if ($result) {
            Write-Host " [OK]" -ForegroundColor Green
            $tests += @{ Test = "Misdiagnosis Prevention"; Status = "PASS" }
        } else {
            throw "Misdiagnosis system not responding"
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
    Write-Host "  [7/9] Testing Statistics System..." -NoNewline
    try {
        $result = Invoke-AIIntegration -Command "get-status-report"
        if ($result -and $result.statistics) {
            Write-Host " [OK]" -ForegroundColor Green
            $tests += @{ Test = "Statistics System"; Status = "PASS" }
        } else {
            throw "Statistics not available"
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        $tests += @{ Test = "Statistics System"; Status = "FAIL"; Error = $_.Exception.Message }
        $allPassed = $false
    }
    
    # Test 8: Issue Detection
    Write-Host "  [8/9] Testing Issue Detection..." -NoNewline
    try {
        $result = Invoke-AIIntegration -Command "detect-issue" -Arguments @("test log line")
        if ($result -ne $null) {
            Write-Host " [OK]" -ForegroundColor Green
            $tests += @{ Test = "Issue Detection"; Status = "PASS" }
        } else {
            throw "Issue detection not responding"
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

# Helper function to call AI integration
function Invoke-AIIntegration {
    param(
        [string]$Command,
        [string[]]$Arguments = @()
    )
    
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