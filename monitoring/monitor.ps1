# Automated Issue Monitoring System
# Monitors logs continuously, detects issues, pauses Unity, and waits for fixes
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

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  AUTOMATED ISSUE MONITORING SYSTEM" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
Write-Info "Starting monitoring system..."
Write-Info "Log file: $logFile"
Write-Info "Check interval: $checkInterval second(s)"
Write-Info "Press Ctrl+C to stop`n"

# Function to call Node.js issue detector
function Invoke-IssueDetector {
    param($logLine)
    
    try {
        $result = node $nodeScript --check "$logLine" 2>&1
        if ($LASTEXITCODE -eq 0 -and $result) {
            return $result | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
    } catch {
        # If Node.js script fails, fall back to basic pattern matching
        return $null
    }
    return $null
}

# Function to pause Unity via server API
function Pause-Unity {
    param($tableId, $reason)
    
    Write-Warning "Pausing Unity - Table: $tableId, Reason: $reason"
    
    try {
        # Use the existing pause mechanism via server
        # The server's log watcher will handle this
        # We just need to ensure the issue is logged
        Write-Info "Issue logged - Unity will be paused by server's log watcher"
        return $true
    } catch {
        Write-Error "Failed to pause Unity: $_"
        return $false
    }
}

# Function to check if server is running
function Test-ServerRunning {
    try {
        $response = Invoke-WebRequest -Uri "$serverUrl/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Function to check for pending issues
function Get-PendingIssues {
    if (Test-Path $pendingIssuesFile) {
        try {
            $content = Get-Content $pendingIssuesFile -Raw | ConvertFrom-Json
            return $content.issues
        } catch {
            return @()
        }
    }
    return @()
}

# Main monitoring loop
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
            $stream = [System.IO.File]::OpenRead($logFile)
            $stream.Position = $lastLogPosition
            $reader = New-Object System.IO.StreamReader($stream)
            
            while ($null -ne ($line = $reader.ReadLine())) {
                # Skip our own monitoring logs
                if ($line -match '\[MONITORING\]|\[ISSUE_DETECTOR\]') {
                    continue
                }
                
                # Skip TRACE logs (informational only)
                if ($line -match '\[TRACE\]') {
                    continue
                }
                
                # Check for error patterns
                $hasError = $line -match '\[ERROR\]|SyntaxError|TypeError|ReferenceError|ECONNREFUSED|EADDRINUSE|SERVER.*FAILED|DATABASE.*FAILED|\[ROOT CAUSE\]|\[FIX\].*DISABLED'
                
                # Check for issues using Node.js detector
                $issue = Invoke-IssueDetector $line
                
                if ($issue -and -not $isPaused) {
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
            
            $reader.Close()
            $stream.Close()
            $lastLogPosition = $currentSize
        }
        
        # Check if issues have been fixed (pending-issues.json is empty)
        if ($isPaused) {
            $pendingIssues = Get-PendingIssues
            if ($pendingIssues.Count -eq 0) {
                Write-Success "All issues fixed! Resuming monitoring..."
                $isPaused = $false
                $currentIssue = $null
            } else {
                Write-Info "Still waiting for fixes... ($($pendingIssues.Count) issue(s) pending)"
            }
        }
        
        # Check server health
        if (-not (Test-ServerRunning)) {
            Write-Warning "Server not responding - may be restarting"
        }
        
    } catch {
        Write-Error "Monitoring error: $_"
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Info "Monitoring stopped"
