$errors = $null
$tokens = $null
$scriptPath = Join-Path $PSScriptRoot 'brokenpromise.ps1'
$content = Get-Content $scriptPath -Raw
[System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)
if ($errors) {
    $errors | ForEach-Object { 
        Write-Host "Line $($_.Extent.StartLineNumber): $($_.Message)" 
    }
} else {
    Write-Host 'No syntax errors found'
}
