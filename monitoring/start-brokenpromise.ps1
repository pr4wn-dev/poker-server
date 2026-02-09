# Wrapper script to start BrokenPromise
# Checks syntax BEFORE trying to run brokenpromise.ps1
# If syntax errors found, exits before BrokenPromise can start

param(
    [ValidateSet("simulation", "normal")]
    [string]$Mode = "simulation",
    [switch]$SkipBootstrap = $false
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$brokenPromisePath = Join-Path $scriptDir "brokenpromise.ps1"

# Check syntax BEFORE trying to run
if (-not $SkipBootstrap) {
    Write-Host "[START] Checking BrokenPromise syntax..." -ForegroundColor Cyan
    
    if (Test-Path $brokenPromisePath) {
        try {
            $errors = $null
            $tokens = $null
            $content = Get-Content $brokenPromisePath -Raw
            
            # Parse the script - this will catch syntax errors
            $null = [System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)
            
            if ($errors -and $errors.Count -gt 0) {
                Write-Host ""
                Write-Host "[START] SYNTAX ERRORS DETECTED - BrokenPromise cannot start" -ForegroundColor Red
                foreach ($err in $errors) {
                    Write-Host "  Line $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Red
                }
                Write-Host ""
                Write-Host "[START] BrokenPromise has syntax errors and cannot start" -ForegroundColor Red
                
                # Write prompt to file
                $projectRoot = Split-Path -Parent $scriptDir
                $promptFile = Join-Path $projectRoot "logs\prompts-for-user.txt"
                $promptText = "═══════════════════════════════════════════════════════════════`r`n"
                $promptText += "  PROMPT FOR USER TO DELIVER TO AI`r`n"
                $promptText += "  Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`n"
                $promptText += "  Type: bootstrap_startup_error`r`n"
                $promptText += "═══════════════════════════════════════════════════════════════`r`n"
                $promptText += "`r`n"
                $promptText += "BrokenPromise has PowerShell syntax errors and cannot start:`r`n"
                $promptText += "`r`n"
                foreach ($err in $errors) {
                    $promptText += "Line $($err.Extent.StartLineNumber): $($err.Message)`r`n"
                }
                $promptText += "`r`n"
                $promptText += "You must:`r`n"
                $promptText += "1. Call beforeAIAction() with context: type='fix_attempt', issueType='powershell_syntax_error', component='BrokenPromise', file='monitoring/brokenpromise.ps1'`r`n"
                $promptText += "2. Check if webSearchRequired is true`r`n"
                $promptText += "3. QUERY THE LEARNING SYSTEM to find solutions:`r`n"
                $promptText += "   - Use queryLearning(`"What solutions worked for powershell_syntax_error?`") or`r`n"
                $promptText += "   - Use getBestSolution(`"powershell_syntax_error`") to get the best known solution`r`n"
                $promptText += "   - Check for matching patterns that solved similar issues`r`n"
                $promptText += "   - The learning system is a tool to save you time - USE IT`r`n"
                $promptText += "4. Fix the syntax errors listed above using the learning system's solution if available`r`n"
                $promptText += "5. Test that BrokenPromise can start successfully`r`n"
                $promptText += "6. Call afterAIAction() with the outcome`r`n"
                $promptText += "`r`n"
                $promptText += "System will verify: tool calls (beforeAIAction, afterAIAction, queryLearning/getBestSolution), state (findings stored), files (code changes)`r`n"
                $promptText += "`r`n"
                $promptText += "═══════════════════════════════════════════════════════════════`r`n"
                
                # Display prompt in console
                Write-Host ""
                Write-Host "=================================================================" -ForegroundColor Yellow
                Write-Host "  PROMPT FOR USER TO DELIVER TO AI" -ForegroundColor Yellow
                Write-Host "=================================================================" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "BrokenPromise has PowerShell syntax errors and cannot start:" -ForegroundColor White
                Write-Host ""
                foreach ($err in $errors) {
                    Write-Host "  Line $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Red
                }
                Write-Host ""
                Write-Host "You must:" -ForegroundColor Cyan
                Write-Host "1. Call beforeAIAction() with context: type='fix_attempt', issueType='powershell_syntax_error', component='BrokenPromise', file='monitoring/brokenpromise.ps1'" -ForegroundColor White
                Write-Host "2. Check if webSearchRequired is true" -ForegroundColor White
                Write-Host "3. QUERY THE LEARNING SYSTEM to find solutions:" -ForegroundColor White
                Write-Host "   - Use queryLearning(`"What solutions worked for powershell_syntax_error?`") or" -ForegroundColor Gray
                Write-Host "   - Use getBestSolution(`"powershell_syntax_error`") to get the best known solution" -ForegroundColor Gray
                Write-Host "   - Check for matching patterns that solved similar issues" -ForegroundColor Gray
                Write-Host "   - The learning system is a tool to save you time - USE IT" -ForegroundColor Gray
                Write-Host "4. Fix the syntax errors listed above using the learning system's solution if available" -ForegroundColor White
                Write-Host "5. Test that BrokenPromise can start successfully" -ForegroundColor White
                Write-Host "6. Call afterAIAction() with the outcome" -ForegroundColor White
                Write-Host ""
                Write-Host "System will verify: tool calls (beforeAIAction, afterAIAction, queryLearning/getBestSolution), state (findings stored), files (code changes)" -ForegroundColor Cyan
                Write-Host ""
                Write-Host "=================================================================" -ForegroundColor Yellow
                Write-Host ""
                
                # Also write to file
                try {
                    if (-not (Test-Path (Split-Path $promptFile -Parent))) {
                        New-Item -ItemType Directory -Path (Split-Path $promptFile -Parent) -Force | Out-Null
                    }
                    $promptText | Out-File -FilePath $promptFile -Encoding UTF8 -Append
                    Write-Host "Prompt also saved to: $promptFile" -ForegroundColor Gray
                } catch {
                    Write-Host "Failed to write prompt file: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                Write-Host ""
                exit 1
            }
            
            Write-Host "[START] Syntax check passed" -ForegroundColor Green
        } catch {
            Write-Host "[START] Syntax check failed: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}

# If we get here, syntax is valid - start BrokenPromise
Write-Host "[START] Starting BrokenPromise..." -ForegroundColor Cyan
& $brokenPromisePath -Mode $Mode -SkipBootstrap:$SkipBootstrap
