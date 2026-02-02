# PowerShell script to enable state snapshots
# Usage: .\scripts\enable-snapshots.ps1

Write-Host "Enabling state snapshots..." -ForegroundColor Green

# Check if .env exists
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    
    if ($envContent -match "ENABLE_STATE_SNAPSHOTS") {
        # Update existing entry
        $envContent = $envContent -replace "ENABLE_STATE_SNAPSHOTS=.*", "ENABLE_STATE_SNAPSHOTS=true"
        Set-Content ".env" $envContent
        Write-Host "Updated ENABLE_STATE_SNAPSHOTS=true in .env" -ForegroundColor Yellow
    } else {
        # Add new entry
        Add-Content ".env" "`nENABLE_STATE_SNAPSHOTS=true"
        Write-Host "Added ENABLE_STATE_SNAPSHOTS=true to .env" -ForegroundColor Yellow
    }
} else {
    # Create .env file
    @"
ENABLE_STATE_SNAPSHOTS=true
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "Created .env file with ENABLE_STATE_SNAPSHOTS=true" -ForegroundColor Yellow
}

# Also set for current session
$env:ENABLE_STATE_SNAPSHOTS = "true"
Write-Host "`nState snapshots enabled for this session!" -ForegroundColor Green
Write-Host "Restart the server to apply changes." -ForegroundColor Cyan

