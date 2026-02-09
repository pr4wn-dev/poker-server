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
    
    # Column 1: System Status & Active Issues
    $col1Lines += "SYSTEM STATUS"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Server: " + $serverStatus
    $col1Lines += "Unity: " + $unityStatus
    $col1Lines += "Simulations: " + $aiStats.game.activeSimulations
    $col1Lines += ""
    
    # Active Issues (what needs attention NOW)
    $activeIssues = if ($aiStats.issues -and $aiStats.issues.active) { $aiStats.issues.active.count } else { 0 }
    $col1Lines += "ACTIVE ISSUES"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Count: " + ("{0:N0}" -f $activeIssues)
    if ($activeIssues -gt 0) {
        $bySeverity = if ($aiStats.issues.active.bySeverity) { $aiStats.issues.active.bySeverity } else { @{critical=0;high=0;medium=0;low=0} }
        if ($bySeverity.critical -gt 0) { $col1Lines += "Critical: " + ("{0:N0}" -f $bySeverity.critical) }
        if ($bySeverity.high -gt 0) { $col1Lines += "High: " + ("{0:N0}" -f $bySeverity.high) }
        if ($bySeverity.medium -gt 0) { $col1Lines += "Medium: " + ("{0:N0}" -f $bySeverity.medium) }
    } else {
        $col1Lines += "Status: All Clear"
    }
    $col1Lines += ""
    
    # Prompt System Status
    $latestPrompt = Get-AILatestPrompt
    $workflow = if ($aiStats.workflow) { $aiStats.workflow } else { @{prompts=@{total=0;pending=0};violations=@{total=0;recent=0}} }
    $col1Lines += "PROMPT SYSTEM"
    $col1Lines += ("-" * ($colWidth - 2))
    $col1Lines += "Pending: " + $workflow.prompts.pending
    $col1Lines += "Total: " + $workflow.prompts.total
    if ($latestPrompt -and -not $latestPrompt.delivered) {
        $col1Lines += "Type: " + $latestPrompt.Type
    }
    
    # Column 2: Learning System (NEW - what we actually use)
    $learning = if ($aiStats.learning) { $aiStats.learning } else { @{patternsLearned=0;knowledgeRules=0;improvements=0} }
    $col2Lines += "LEARNING SYSTEM"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "Patterns: " + ("{0:N0}" -f $learning.patternsLearned)
    $col2Lines += "Knowledge: " + ("{0:N0}" -f $learning.knowledgeRules)
    $col2Lines += "Improvements: " + ("{0:N0}" -f $learning.improvements)
    $col2Lines += ""
    
    # Pattern Matching (from learning engine)
    $patternMatches = if ($learning.patternsLearned -gt 0) { "Active" } else { "None Yet" }
    $col2Lines += "PATTERN MATCHING"
    $col2Lines += ("-" * ($colWidth - 2))
    $col2Lines += "Status: " + $patternMatches
    if ($learning.recentImprovements -and $learning.recentImprovements.Count -gt 0) {
        $col2Lines += "Recent: " + $learning.recentImprovements.Count
    }
    $col2Lines += ""
    
    # Fix Attempts by Issue Type
    $fixAttemptsByIssue = if ($learning.fixAttempts -and $learning.fixAttempts.byIssue) { $learning.fixAttempts.byIssue } else { @{} }
    if ($fixAttemptsByIssue.Count -gt 0) {
        $col2Lines += "FIX ATTEMPTS"
        $col2Lines += ("-" * ($colWidth - 2))
        $issueTypes = $fixAttemptsByIssue.Keys | Select-Object -First 3
        foreach ($type in $issueTypes) {
            $count = $fixAttemptsByIssue[$type]
            $typeShort = if ($type.Length -gt 15) { $type.Substring(0, 12) + "..." } else { $type }
            $col2Lines += "$typeShort : $count"
        }
    }
    
    # Column 3: Fixes & Compliance
    $fixAttempts = if ($aiStats.fixes -and $aiStats.fixes.attempts) { $aiStats.fixes.attempts } else { @{total=0;successes=0;failures=0;successRate=0} }
    $col3Lines += "FIX STATISTICS"
    $col3Lines += ("-" * ($colWidth - 2))
    $col3Lines += "Total: " + ("{0:N0}" -f $fixAttempts.total)
    $col3Lines += "Success: " + ("{0:N0}" -f $fixAttempts.successes)
    $col3Lines += "Failed: " + ("{0:N0}" -f $fixAttempts.failures)
    $successRate = if ($fixAttempts.total -gt 0) { ($fixAttempts.successes / $fixAttempts.total) * 100 } else { 0 }
    $col3Lines += "Rate: " + ("{0:N1}%" -f $successRate)
    $col3Lines += ""
    
    # Working Fixes
    $workingFixes = if ($aiStats.fixes -and $aiStats.fixes.workingFixes) { $aiStats.fixes.workingFixes } else { @() }
    $col3Lines += "WORKING FIXES"
    $col3Lines += ("-" * ($colWidth - 2))
    $col3Lines += "Count: " + ("{0:N0}" -f $workingFixes.Count)
    if ($workingFixes.Count -gt 0) {
        $avgSuccessRate = ($workingFixes | ForEach-Object { $_.successRate } | Measure-Object -Average).Average
        if ($avgSuccessRate) {
            $col3Lines += "Avg Rate: " + ("{0:N1}%" -f ($avgSuccessRate * 100))
        }
    }
    $col3Lines += ""
    
    # Workflow Compliance
    $workflow = if ($aiStats.workflow) { $aiStats.workflow } else { @{violations=@{total=0;recent=0};compliance=@{}} }
    $col3Lines += "WORKFLOW COMPLIANCE"
    $col3Lines += ("-" * ($colWidth - 2))
    $col3Lines += "Violations: " + $workflow.violations.recent
    $col3Lines += "Total: " + $workflow.violations.total
    if ($workflow.compliance.lastBeforeAction) {
        $timeSince = (Get-Date).ToUniversalTime() - ([DateTimeOffset]::FromUnixTimeMilliseconds($workflow.compliance.lastBeforeAction).LocalDateTime)
        $timeSinceStr = if ($timeSince.TotalMinutes -lt 1) { "$([Math]::Round($timeSince.TotalSeconds))s" } else { "$([Math]::Round($timeSince.TotalMinutes))m" }
        $col3Lines += "Last Action: " + $timeSinceStr + " ago"
    } else {
        $col3Lines += "Last Action: Never"
    }
    
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
    
    # Workflow Violations section (full width, if violations exist)
    $workflow = if ($aiStats.workflow) { $aiStats.workflow } else { @{violations=@{total=0;recent=0;recentList=@()}} }
    if ($workflow.violations.recent -gt 0) {
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Red
        Write-Host "WORKFLOW VIOLATIONS DETECTED" -ForegroundColor Red
        Write-Host ("=" * $consoleWidth) -ForegroundColor Red
        
        $recentViolations = if ($workflow.violations.recentList) { $workflow.violations.recentList } else { @() }
        foreach ($violation in $recentViolations) {
            $severityColor = switch ($violation.severity) {
                "critical" { "Red" }
                "high" { "Yellow" }
                default { "White" }
            }
            $timeAgo = if ($violation.timestamp) {
                $timeSince = (Get-Date).ToUniversalTime() - ([DateTimeOffset]::FromUnixTimeMilliseconds($violation.timestamp).LocalDateTime)
                "$([math]::Round($timeSince.TotalMinutes))m ago"
            } else { "Unknown" }
            
            Write-Host ""
            Write-Host "  [$($violation.severity.ToUpper())] $($violation.violation)" -ForegroundColor $severityColor
            if ($violation.file) {
                Write-Host "    File: $($violation.file)" -ForegroundColor Gray
            }
            Write-Host "    Time: $timeAgo" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "Total Violations: $($workflow.violations.total)" -ForegroundColor Yellow
        Write-Host ("=" * $consoleWidth) -ForegroundColor Red
    }
    
    # Active Issues Details (full width, if any active issues)
    $activeIssues = if ($aiStats.issues -and $aiStats.issues.active) { $aiStats.issues.active } else { @{count=0;issues=@()} }
    if ($activeIssues.count -gt 0 -and $activeIssues.issues) {
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
        Write-Host "ACTIVE ISSUES REQUIRING ATTENTION" -ForegroundColor White
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
        
        $displayedIssues = $activeIssues.issues | Select-Object -First 5
        foreach ($issue in $displayedIssues) {
            $severity = if ($issue.severity) { $issue.severity } else { "unknown" }
            $type = if ($issue.type) { $issue.type } else { "unknown" }
            $color = if ($severity -eq "critical") { "Red" } elseif ($severity -eq "high") { "Yellow" } else { "Gray" }
            $count = if ($issue.count) { " (x$($issue.count))" } else { "" }
            Write-Host "  [$($severity.ToUpper())] $type$count" -ForegroundColor $color
        }
        
        if ($activeIssues.count -gt 5) {
            Write-Host "  ... and $($activeIssues.count - 5) more" -ForegroundColor Gray
        }
        Write-Host ("=" * $consoleWidth) -ForegroundColor Yellow
    }
    
    # Learning Insights (full width, if learning system has data)
    $learning = if ($aiStats.learning) { $aiStats.learning } else { @{patternsLearned=0;recentImprovements=@()} }
    if ($learning.patternsLearned -gt 0 -or ($learning.recentImprovements -and $learning.recentImprovements.Count -gt 0)) {
        Write-Host ""
        Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
        Write-Host "LEARNING SYSTEM INSIGHTS" -ForegroundColor White
        Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
        
        Write-Host "Patterns Learned: $($learning.patternsLearned)" -ForegroundColor White
        Write-Host "Knowledge Base: $($learning.knowledgeRules) rules" -ForegroundColor White
        Write-Host "Improvements Tracked: $($learning.improvements)" -ForegroundColor White
        
        if ($learning.recentImprovements -and $learning.recentImprovements.Count -gt 0) {
            Write-Host ""
            Write-Host "Recent Improvements:" -ForegroundColor Yellow
            $recent = $learning.recentImprovements | Select-Object -Last 3
            foreach ($improvement in $recent) {
                $desc = if ($improvement.description) { $improvement.description } elseif ($improvement.issueType) { $improvement.issueType } else { "Improvement" }
                $descShort = if ($desc.Length -gt 50) { $desc.Substring(0, 47) + "..." } else { $desc }
                Write-Host "  - $descShort" -ForegroundColor Gray
            }
        }
        Write-Host ("=" * $consoleWidth) -ForegroundColor Cyan
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
