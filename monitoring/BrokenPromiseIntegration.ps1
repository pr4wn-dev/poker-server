# BrokenPromise Integration Helper Functions
# Bridge between PowerShell BrokenPromise and AI core

$script:aiIntegrationScript = Join-Path $PSScriptRoot "integration\BrokenPromise-integration.js"

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
    $result = Invoke-AIIntegration -Command "get-investigation-status"
    if ($result) {
        return @{
            Active = $result.active
            Status = $result.status
            StartTime = if ($result.startTime) { [DateTime]::Parse($result.startTime) } else { $null }
            Timeout = $result.timeout
            Progress = $result.progress
            TimeRemaining = $result.timeRemaining
            IssuesCount = $result.issuesCount
            Issues = $result.issues
        }
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
