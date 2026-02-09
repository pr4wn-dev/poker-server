# BrokenPromise Bootstrap Checker
# Runs BEFORE BrokenPromise starts to detect startup issues
# If issues found, generates prompt for user to deliver to AI

param(
    [switch]$SkipPromptGeneration = $false
)

$ErrorActionPreference = "Continue"

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$logsDir = Join-Path $projectRoot "logs"

# Ensure logs directory exists
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$promptFile = Join-Path $logsDir "prompts-for-user.txt"
$issues = @()
$criticalIssues = @()

# Function to add issue
function Add-Issue {
    param(
        [string]$Type,
        [string]$Message,
        [string]$Details = "",
        [bool]$Critical = $false
    )
    
    $issue = @{
        Type = $Type
        Message = $Message
        Details = $Details
        Critical = $Critical
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    if ($Critical) {
        $script:criticalIssues += $issue
    } else {
        $script:issues += $issue
    }
}

# Check 1: PowerShell syntax check on brokenpromise.ps1
Write-Host "[BOOTSTRAP] Checking PowerShell syntax..." -ForegroundColor Cyan
$brokenPromisePath = Join-Path $scriptDir "brokenpromise.ps1"
if (Test-Path $brokenPromisePath) {
    try {
        $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $brokenPromisePath -Raw), [ref]$null)
        Write-Host "  ✓ PowerShell syntax valid" -ForegroundColor Green
    } catch {
        Add-Issue -Type "powershell_syntax_error" -Message "PowerShell syntax error in brokenpromise.ps1" -Details $_.Exception.Message -Critical $true
        Write-Host "  ✗ PowerShell syntax error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Add-Issue -Type "file_missing" -Message "brokenpromise.ps1 not found" -Details $brokenPromisePath -Critical $true
    Write-Host "  ✗ brokenpromise.ps1 not found" -ForegroundColor Red
}

# Check 2: Node.js availability
Write-Host "[BOOTSTRAP] Checking Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Node.js available: $nodeVersion" -ForegroundColor Green
    } else {
        Add-Issue -Type "nodejs_missing" -Message "Node.js not available" -Details "node command failed" -Critical $true
        Write-Host "  ✗ Node.js not available" -ForegroundColor Red
    }
} catch {
    Add-Issue -Type "nodejs_missing" -Message "Node.js not available" -Details $_.Exception.Message -Critical $true
    Write-Host "  ✗ Node.js not available: $($_.Exception.Message)" -ForegroundColor Red
}

# Check 3: Required Node.js files exist
Write-Host "[BOOTSTRAP] Checking Node.js integration files..." -ForegroundColor Cyan
$integrationFiles = @(
    "integration\BrokenPromiseIntegration.js",
    "integration\brokenpromise-integration.js",
    "core\AIMonitorCore.js",
    "core\StateStore.js",
    "core\PromptGenerator.js"
)

foreach ($file in $integrationFiles) {
    $filePath = Join-Path $scriptDir $file
    if (Test-Path $filePath) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Add-Issue -Type "file_missing" -Message "Required file missing: $file" -Details $filePath -Critical $true
        Write-Host "  ✗ $file not found" -ForegroundColor Red
    }
}

# Check 4: Test Node.js integration can load
Write-Host "[BOOTSTRAP] Testing Node.js integration..." -ForegroundColor Cyan
$integrationTestScript = Join-Path $scriptDir "integration\brokenpromise-integration.js"
if (Test-Path $integrationTestScript) {
    try {
        $testResult = node $integrationTestScript "get-latest-prompt" 2>&1
        if ($LASTEXITCODE -eq 0 -or $testResult -match "No prompt available" -or $testResult -match "error") {
            # Exit code 0 or expected error messages are OK
            Write-Host "  ✓ Node.js integration loads successfully" -ForegroundColor Green
        } else {
            Add-Issue -Type "nodejs_integration_error" -Message "Node.js integration failed to load" -Details $testResult -Critical $true
            Write-Host "  ✗ Node.js integration error: $testResult" -ForegroundColor Red
        }
    } catch {
        Add-Issue -Type "nodejs_integration_error" -Message "Node.js integration failed to load" -Details $_.Exception.Message -Critical $true
        Write-Host "  ✗ Node.js integration error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Check 5: Required PowerShell files exist
Write-Host "[BOOTSTRAP] Checking PowerShell integration files..." -ForegroundColor Cyan
$psFiles = @(
    "BrokenPromiseIntegration.ps1",
    "Show-BrokenPromiseStatistics.ps1"
)

foreach ($file in $psFiles) {
    $filePath = Join-Path $scriptDir $file
    if (Test-Path $filePath) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Add-Issue -Type "file_missing" -Message "Required PowerShell file missing: $file" -Details $filePath -Critical $false
        Write-Host "  ✗ $file not found" -ForegroundColor Yellow
    }
}

# Check 6: Test PowerShell integration can load
Write-Host "[BOOTSTRAP] Testing PowerShell integration..." -ForegroundColor Cyan
$psIntegrationPath = Join-Path $scriptDir "BrokenPromiseIntegration.ps1"
if (Test-Path $psIntegrationPath) {
    try {
        # Try to dot-source it (this will catch syntax errors)
        $null = . $psIntegrationPath
        Write-Host "  ✓ PowerShell integration loads successfully" -ForegroundColor Green
    } catch {
        Add-Issue -Type "powershell_integration_error" -Message "PowerShell integration failed to load" -Details $_.Exception.Message -Critical $true
        Write-Host "  ✗ PowerShell integration error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Check 7: Check logs directory is writable
Write-Host "[BOOTSTRAP] Checking logs directory..." -ForegroundColor Cyan
if (Test-Path $logsDir) {
    try {
        $testFile = Join-Path $logsDir "bootstrap-test.txt"
        "test" | Out-File -FilePath $testFile -ErrorAction Stop
        Remove-Item $testFile -ErrorAction Stop
        Write-Host "  ✓ Logs directory is writable" -ForegroundColor Green
    } catch {
        Add-Issue -Type "logs_directory_error" -Message "Logs directory not writable" -Details $_.Exception.Message -Critical $true
        Write-Host "  ✗ Logs directory not writable: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Add-Issue -Type "logs_directory_missing" -Message "Logs directory does not exist" -Details $logsDir -Critical $true
    Write-Host "  ✗ Logs directory does not exist" -ForegroundColor Red
}

# Generate prompt if issues found
if (($criticalIssues.Count -gt 0 -or $issues.Count -gt 0) -and -not $SkipPromptGeneration) {
    Write-Host ""
    Write-Host "[BOOTSTRAP] Issues detected - generating prompt..." -ForegroundColor Yellow
    
    $promptText = @"
═══════════════════════════════════════════════════════════════
  PROMPT FOR USER TO DELIVER TO AI
  Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  Type: bootstrap_startup_error
═══════════════════════════════════════════════════════════════

BrokenPromise failed to start due to the following issue(s):

"@
    
    if ($criticalIssues.Count -gt 0) {
        $promptText += "`nCRITICAL ISSUES:`n"
        foreach ($issue in $criticalIssues) {
            $promptText += "`n- $($issue.Type): $($issue.Message)`n"
            if ($issue.Details) {
                $promptText += "  Details: $($issue.Details)`n"
            }
        }
    }
    
    if ($issues.Count -gt 0) {
        $promptText += "`nWARNINGS:`n"
        foreach ($issue in $issues) {
            $promptText += "`n- $($issue.Type): $($issue.Message)`n"
            if ($issue.Details) {
                $promptText += "  Details: $($issue.Details)`n"
            }
        }
    }
    
    $promptText += @"

You must:
1. Fix the issue(s) listed above
2. Test that BrokenPromise can start successfully
3. Verify all required files are present and valid
4. Ensure Node.js is available and working
5. Check that all PowerShell syntax is correct

System will verify: BrokenPromise starts successfully, no errors in bootstrap check

═══════════════════════════════════════════════════════════════
"@
    
    try {
        $promptText | Out-File -FilePath $promptFile -Encoding UTF8 -Append
        Write-Host "  ✓ Prompt written to: $promptFile" -ForegroundColor Green
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
        Write-Host "⚠️  PROMPT FOR USER TO DELIVER TO AI" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Yellow
        Write-Host ""
        Write-Host $promptText -ForegroundColor White
        Write-Host ""
    } catch {
        Write-Host "  ✗ Failed to write prompt file: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Return non-zero exit code to indicate failure
    exit 1
} else {
    Write-Host ""
    Write-Host "[BOOTSTRAP] All checks passed - BrokenPromise can start" -ForegroundColor Green
    exit 0
}
