# AI-Powered Statistics Display
# Replaces Show-Statistics with AI-first system
# Maintains visual format while using AI data

function Show-BrokenPromiseStatistics {
    param(
        [hashtable]$LegacyStats = @{},
        [string]$LogFile = "",
        [string]$ServerUrl = "http://localhost:3000"
    )
    
    # Get AI statistics
    $aiStats = Get-AILiveStatistics
    if (-not $aiStats) {
        Write-Warning "AI statistics unavailable - falling back to legacy display"
        return
    }
    
    # Get console width for dynamic layout
    $consoleWidth = [Console]::WindowWidth
    if ($consoleWidth -lt 120) { $consoleWidth = 120 }
    $colWidth = [Math]::Floor(($consoleWidth - 6) / 3)  # 3 columns with separators
    
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
            # Console handle may be invalid - just continue
        }
    }
    
    # Header
    $headerText = "BrokenPromise - THE THREE-HEADED GUARDIAN - LIVE STATISTICS"
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    $headerPadding = [Math]::Max(0, [Math]::Floor(($consoleWidth - $headerText.Length) / 2))
    Write-Host (" " * $headerPadding + $headerText) -ForegroundColor White
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    
    # Top status bar
    $statusText = "ACTIVE"
    $statusColor = "Green"
    if ($aiStats.monitoring.investigation.active) {
        $statusText = "INVESTIGATING"
        $statusColor = "Yellow"
    } elseif ($aiStats.monitoring.unity.paused) {
        $statusText = "PAUSED (Fix Required)"
        $statusColor = "Red"
    }
    
    $uptime = if ($aiStats.system.uptime) { 
        $hours = [Math]::Floor($aiStats.system.uptime / 3600)
        $minutes = [Math]::Floor(($aiStats.system.uptime % 3600) / 60)
        $seconds = [Math]::Floor($aiStats.system.uptime % 60)
        "{0:D2}:{1:D2}:{2:D2}" -f $hours, $minutes, $seconds
    } else { "00:00:00" }
    
    $serverStatus = if ($aiStats.system.server.status -eq "online") { "ONLINE" } else { "OFFLINE" }
    $serverColor = if ($aiStats.system.server.status -eq "online") { "Green" } else { "Red" }
    
    $unityStatus = if ($aiStats.monitoring.unity.paused) { "PAUSED" } elseif ($aiStats.monitoring.unity.connected) { "ACTIVE" } else { "STOPPED" }
    $unityColor = if ($aiStats.monitoring.unity.paused) { "Red" } elseif ($aiStats.monitoring.unity.connected) { "Green" } else { "Gray" }
    
    $simStatus = if ($aiStats.game.activeSimulations -gt 0) { "ACTIVE" } else { "STOPPED" }
    $simColor = if ($aiStats.game.activeSimulations -gt 0) { "Green" } else { "Red" }
    
    $activityText = if ($aiStats.monitoring.lastActivity) {
        $timeSince = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($aiStats.monitoring.lastActivity))
        "$([math]::Round($timeSince.TotalSeconds))s ago"
    } else { "N/A" }
    $activityColor = if ($aiStats.monitoring.lastActivity) {
        $timeSince = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($aiStats.monitoring.lastActivity))
        if ($timeSince.TotalSeconds -lt 60) { "Green" } elseif ($timeSince.TotalSeconds -lt 120) { "Yellow" } else { "Red" }
    } else { "Gray" }
    
    $pipeSeparator = [char]124
    $separatorStr = " $pipeSeparator "
    
    Write-Host ""
    Write-Host "STATUS: " -NoNewline -ForegroundColor White
    Write-Host $statusText -NoNewline -ForegroundColor $statusColor
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "UPTIME: " -NoNewline -ForegroundColor White
    Write-Host $uptime -NoNewline -ForegroundColor Yellow
    Write-Host $separatorStr -NoNewline -ForegroundColor DarkGray
    Write-Host "SERVER: " -NoNewline -ForegroundColor White
    Write-Host $serverStatus -NoNewline -ForegroundColor $serverColor
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
    
    # Column 1: System Status & Monitoring
    $col1Lines += "SYSTEM STATUS"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Server: " + $serverStatus
    $col1Lines += "Simulations: " + $aiStats.game.activeSimulations
    $col1Lines += "Database: " + $(if($aiStats.system.database.status -eq "online"){"CONNECTED"}else{"UNKNOWN"})
    $col1Lines += ""
    
    $col1Lines += "MONITOR STATE"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Unity Status: " + $(if($aiStats.monitoring.unity.paused){"PAUSED"}else{"ACTIVE"})
    $col1Lines += "Waiting: " + $(if($aiStats.monitoring.unity.paused){"FIX REQUIRED"}else{"NONE"})
    $col1Lines += ""
    
    $col1Lines += "Current Action:"
    if ($aiStats.monitoring.investigation.active) {
        $col1Lines += "  INVESTIGATING"
        if ($aiStats.monitoring.investigation.startTime) {
            $startTime = [DateTime]::Parse($aiStats.monitoring.investigation.startTime)
            $elapsed = (Get-Date) - $startTime
            $col1Lines += "  Elapsed: " + ("{0:N0}s" -f $elapsed.TotalSeconds)
        }
    } elseif ($aiStats.monitoring.unity.paused) {
        $col1Lines += "  WAITING FOR FIX"
    } else {
        $col1Lines += "  MONITORING LOGS"
    }
    
    # Check for pending prompt
    $latestPrompt = Get-AILatestPrompt
    if ($latestPrompt -and -not $latestPrompt.delivered) {
        $col1Lines += ""
        $col1Lines += "⚠️ PROMPT FOR USER"
        $col1Lines += ("-" * ($colWidth - 2))
        $col1Lines += "Type: " + $latestPrompt.Type
        $col1Lines += "See: logs\prompts-for-user.txt"
        $col1Lines += "Or check terminal below"
    }
    
    # Workflow Violations
    $workflow = if ($aiStats.workflow) { $aiStats.workflow } else { @{violations=@{total=0;recent=0;recentList=@()}} }
    if ($workflow.violations.recent -gt 0) {
        $col1Lines += ""
        $col1Lines += "🚨 WORKFLOW VIOLATIONS"
        $col1Lines += ("-" * ($colWidth - 2))
        $col1Lines += "Recent: " + $workflow.violations.recent
        $col1Lines += "Total: " + $workflow.violations.total
        if ($workflow.violations.recentList -and $workflow.violations.recentList.Count -gt 0) {
            $col1Lines += ""
            $col1Lines += "Latest:"
            $latestViolation = $workflow.violations.recentList[0]
            $violationText = if ($latestViolation.violation) { 
                $latestViolation.violation.Substring(0, [Math]::Min(30, $latestViolation.violation.Length))
            } else { "Unknown" }
            $col1Lines += "  " + $violationText
        }
    }
    
    # Column 2: Detection & Issues
    $col2Lines += "DETECTION STATS"
    $col2Lines += ("-" * ($colWidth - 2))
    $linesProcessed = if ($aiStats.monitoring -and $aiStats.monitoring.logs) { $aiStats.monitoring.logs.processed } else { 0 }
    $totalIssues = if ($aiStats.issues) { $aiStats.issues.total } else { 0 }
    $activeIssues = if ($aiStats.issues -and $aiStats.issues.active) { $aiStats.issues.active.count } else { 0 }
    $col2Lines += "Lines: " + ("{0:N0}" -f $linesProcessed)
    $col2Lines += "Issues: " + ("{0:N0}" -f $totalIssues)
    $col2Lines += "Active: " + ("{0:N0}" -f $activeIssues)
    $col2Lines += ""
    
    $col2Lines += "ISSUES BY SEVERITY"
    $col2Lines += ("-" * ($colWidth - 2))
    $bySeverity = if ($aiStats.issues -and $aiStats.issues.bySeverity) { $aiStats.issues.bySeverity } else { @{critical=0;high=0;medium=0;low=0} }
    $col2Lines += "Critical: " + ("{0:N0}" -f $bySeverity.critical)
    $col2Lines += "High:     " + ("{0:N0}" -f $bySeverity.high)
    $col2Lines += "Medium:   " + ("{0:N0}" -f $bySeverity.medium)
    $col2Lines += "Low:      " + ("{0:N0}" -f $bySeverity.low)
    
    # Column 3: Fixes & Learning
    $col3Lines += "FIX STATISTICS"
    $col3Lines += ("-" * ($colWidth - 2))
    $fixAttempts = if ($aiStats.fixes -and $aiStats.fixes.attempts) { $aiStats.fixes.attempts } else { @{total=0;successful=0;failed=0;successRate=0} }
    $col3Lines += "Total Attempts: " + ("{0:N0}" -f $fixAttempts.total)
    $col3Lines += "Successful: " + ("{0:N0}" -f $fixAttempts.successful)
    $col3Lines += "Failed: " + ("{0:N0}" -f $fixAttempts.failed)
    $col3Lines += "Success Rate: " + ("{0:N1}%" -f ($fixAttempts.successRate * 100))
    $col3Lines += ""
    
    $col3Lines += "AI LEARNING"
    $col3Lines += ("-" * ($colWidth - 2))
    $learning = if ($aiStats.learning) { $aiStats.learning } else { @{patterns=@{count=0};workingFixes=@{count=0}} }
    $col3Lines += "Patterns: " + ("{0:N0}" -f $learning.patterns.count)
    $col3Lines += "Working Fixes: " + ("{0:N0}" -f $learning.workingFixes.count)
    
    # Display columns
    $maxLines = [Math]::Max($col1Lines.Count, [Math]::Max($col2Lines.Count, $col3Lines.Count))
    for ($i = 0; $i -lt $maxLines; $i++) {
        $line1 = if ($i -lt $col1Lines.Count) { $col1Lines[$i] } else { "" }
        $line2 = if ($i -lt $col2Lines.Count) { $col2Lines[$i] } else { "" }
        $line3 = if ($i -lt $col3Lines.Count) { $col3Lines[$i] } else { "" }
        
        # Pad lines to column width
        $line1 = $line1.PadRight($colWidth)
        $line2 = $line2.PadRight($colWidth)
        $line3 = $line3.PadRight($colWidth)
        
        Write-Host "$line1 | $line2 | $line3"
    }
    
    # Investigation section (full width, always visible)
    Write-Host ""
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    Write-Host "INVESTIGATION STATUS" -ForegroundColor White
    Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
    
    $investigation = if ($aiStats.monitoring -and $aiStats.monitoring.investigation) { $aiStats.monitoring.investigation } else { @{active=$false} }
    
    if ($investigation.active) {
        try {
            $startTime = if ($investigation.startTime) { [DateTime]::Parse($investigation.startTime) } else { Get-Date }
            $elapsed = (Get-Date) - $startTime
            $remaining = if ($investigation.timeRemaining) { $investigation.timeRemaining } else { 0 }
            $progress = if ($investigation.progress) { $investigation.progress } else { 0 }
            $issuesCount = if ($investigation.issuesCount) { $investigation.issuesCount } else { 0 }
            
            Write-Host "Status: ACTIVE" -ForegroundColor Yellow
            Write-Host "Started: $($startTime.ToString('HH:mm:ss'))"
            Write-Host "Elapsed: $([Math]::Round($elapsed.TotalSeconds, 1))s"
            Write-Host "Remaining: $([Math]::Round($remaining, 1))s"
            Write-Host "Progress: $([Math]::Round($progress, 1))%"
            Write-Host "Issues Found: $issuesCount"
            
            if ($investigation.issues -and $investigation.issues.Count -gt 0) {
                Write-Host ""
                Write-Host "Current Issues:" -ForegroundColor White
                foreach ($issue in $investigation.issues) {
                    $severity = if ($issue.severity) { $issue.severity } else { "unknown" }
                    $type = if ($issue.type) { $issue.type } else { "unknown" }
                    $color = if ($severity -eq "critical") { "Red" } elseif ($severity -eq "high") { "Yellow" } else { "Gray" }
                    Write-Host "  - $type ($severity)" -ForegroundColor $color
                }
            }
        } catch {
            Write-Host "Status: ACTIVE (Error displaying details)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Status: NOT ACTIVE" -ForegroundColor Gray
        Write-Host "Waiting for issues to trigger investigation"
    }
    
    # Recommendations section
    if ($aiStats.recommendations -and $aiStats.recommendations.priority -and $aiStats.recommendations.priority.Count -gt 0) {
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
        Write-Host "AI RECOMMENDATIONS" -ForegroundColor White
        Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
        
        foreach ($rec in $aiStats.recommendations.priority) {
            $priority = if ($rec.priority) { $rec.priority } else { "low" }
            $action = if ($rec.action) { $rec.action } else { "No action specified" }
            $recColor = if ($priority -eq "high") { "Red" } elseif ($priority -eq "medium") { "Yellow" } else { "Gray" }
            Write-Host "  [$($priority.ToUpper())] $action" -ForegroundColor $recColor
        }
    }
    
    # Prompt for user section
    $latestPrompt = Get-AILatestPrompt
    if ($latestPrompt -and -not $latestPrompt.delivered) {
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
        Write-Host "⚠️  PROMPT FOR USER TO DELIVER TO AI" -ForegroundColor Yellow
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Type: $($latestPrompt.Type)" -ForegroundColor White
        Write-Host "Generated: $($latestPrompt.Timestamp.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Copy and paste this prompt to the AI:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host $latestPrompt.Prompt -ForegroundColor White
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
        Write-Host "Also available in: logs\prompts-for-user.txt" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host ""
}
