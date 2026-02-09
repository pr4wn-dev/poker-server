# Simple BrokenPromise Statistics Display
# Works in any terminal (no cursor positioning needed)

function Show-SimpleStats {
    while ($true) {
        Clear-Host
        
        Write-Host "=== BROKENPROMISE STATISTICS ===" -ForegroundColor Cyan
        Write-Host ""
        
        try {
            $stats = node monitoring\integration\brokenpromise-integration.js get-live-statistics 2>$null | ConvertFrom-Json
            
            # System Status
            Write-Host "SYSTEM STATUS:" -ForegroundColor White
            Write-Host "  Server: $($stats.system.server.status)"
            Write-Host "  Database: $($stats.system.database.status)"
            Write-Host "  Unity: $($stats.system.unity.status)"
            Write-Host ""
            
            # Issues
            Write-Host "ISSUES:" -ForegroundColor White
            Write-Host "  Active: $($stats.issues.active.count)"
            Write-Host "  Resolved: $($stats.issues.resolved.count)"
            Write-Host "  Total: $($stats.issues.total.count)"
            Write-Host ""
            
            # Learning System
            Write-Host "LEARNING SYSTEM:" -ForegroundColor White
            Write-Host "  Patterns: $($stats.learning.patternsLearned)"
            Write-Host "  Knowledge: $($stats.learning.knowledgeRules)"
            Write-Host "  Improvements: $($stats.learning.improvements)"
            Write-Host ""
            
            # Workflow
            Write-Host "WORKFLOW:" -ForegroundColor White
            Write-Host "  Violations: $($stats.workflow.violations.total)"
            Write-Host "  Prompts Total: $($stats.workflow.prompts.total)"
            Write-Host "  Prompts Pending: $($stats.workflow.prompts.pending)"
            Write-Host ""
            
            # Fixes
            Write-Host "FIXES:" -ForegroundColor White
            Write-Host "  Attempts: $($stats.fixes.attempts.total)"
            Write-Host "  Successes: $($stats.fixes.attempts.successes)"
            Write-Host "  Failures: $($stats.fixes.attempts.failures)"
            if ($stats.fixes.attempts.total -gt 0) {
                $successRate = [math]::Round(($stats.fixes.attempts.successes / $stats.fixes.attempts.total) * 100, 1)
                Write-Host "  Success Rate: $successRate%"
            }
            Write-Host ""
            
            # Latest Prompt
            if ($stats.workflow.prompts.latest) {
                Write-Host "LATEST PROMPT:" -ForegroundColor Yellow
                Write-Host "  Type: $($stats.workflow.prompts.latest.type)"
                Write-Host "  Delivered: $($stats.workflow.prompts.latest.delivered)"
                $promptPreview = $stats.workflow.prompts.latest.prompt
                if ($promptPreview.Length -gt 150) {
                    $promptPreview = $promptPreview.Substring(0, 150) + "..."
                }
                Write-Host "  Preview: $promptPreview"
                Write-Host ""
            }
            
            # Workflow Violations (if any)
            if ($stats.workflow.violations.recent -gt 0) {
                Write-Host "RECENT VIOLATIONS: $($stats.workflow.violations.recent)" -ForegroundColor Red
                Write-Host ""
            }
            
        } catch {
            Write-Host "Error getting statistics: $_" -ForegroundColor Red
        }
        
        Write-Host "Updated: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray
        Write-Host "Press Ctrl+C to stop"
        Write-Host ""
        
        Start-Sleep -Seconds 5
    }
}

Show-SimpleStats
