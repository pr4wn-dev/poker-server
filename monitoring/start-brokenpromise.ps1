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
                $promptText += "1. Fix the syntax errors listed above`r`n"
                $promptText += "2. Test that BrokenPromise can start successfully`r`n"
                $promptText += "`r`n"
                $promptText += "═══════════════════════════════════════════════════════════════`r`n"
                
                try {
                    if (-not (Test-Path (Split-Path $promptFile -Parent))) {
                        New-Item -ItemType Directory -Path (Split-Path $promptFile -Parent) -Force | Out-Null
                    }
                    $promptText | Out-File -FilePath $promptFile -Encoding UTF8 -Append
                    Write-Host "[START] Prompt written to: $promptFile" -ForegroundColor Yellow
                } catch {
                    Write-Host "[START] Failed to write prompt file: $($_.Exception.Message)" -ForegroundColor Yellow
                }
                
                Write-Host ""
                Write-Host "See logs\prompts-for-user.txt for prompt to give to AI" -ForegroundColor Yellow
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
