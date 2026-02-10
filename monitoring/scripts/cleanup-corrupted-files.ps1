# Cleanup Corrupted State Store Files
# Removes old corrupted JSON backups (we use MySQL now, these are no longer needed)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$monitoringDir = Split-Path -Parent $scriptDir
$projectRoot = Split-Path -Parent $monitoringDir
$logsDir = Join-Path $projectRoot "logs"

Write-Host "=== CLEANUP CORRUPTED STATE STORE FILES ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $logsDir)) {
    Write-Host "Logs directory not found: $logsDir" -ForegroundColor Yellow
    exit 0
}

# Find all corrupted state store files
$corruptedFiles = Get-ChildItem -Path $logsDir -Filter "ai-state-store.json.corrupted.*" -ErrorAction SilentlyContinue

if (-not $corruptedFiles -or $corruptedFiles.Count -eq 0) {
    Write-Host "No corrupted files found. ✓" -ForegroundColor Green
    exit 0
}

# Calculate total size
$totalSize = ($corruptedFiles | Measure-Object -Property Length -Sum).Sum
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
$totalSizeGB = [math]::Round($totalSize / 1GB, 2)

Write-Host "Found $($corruptedFiles.Count) corrupted files" -ForegroundColor Yellow
Write-Host "Total size: $totalSizeMB MB ($totalSizeGB GB)" -ForegroundColor Yellow
Write-Host ""

# Keep the 2 most recent files (in case we need to recover something)
# Delete all others
$filesToKeep = 2
$filesToDelete = $corruptedFiles | Sort-Object LastWriteTime -Descending | Select-Object -Skip $filesToKeep

if ($filesToDelete.Count -eq 0) {
    Write-Host "All files are within the keep limit ($filesToKeep). No cleanup needed." -ForegroundColor Green
    exit 0
}

$sizeToDelete = ($filesToDelete | Measure-Object -Property Length -Sum).Sum
$sizeToDeleteMB = [math]::Round($sizeToDelete / 1MB, 2)
$sizeToDeleteGB = [math]::Round($sizeToDelete / 1GB, 2)

Write-Host "Will delete $($filesToDelete.Count) files ($sizeToDeleteMB MB / $sizeToDeleteGB GB)" -ForegroundColor Cyan
Write-Host "Keeping $filesToKeep most recent files for safety" -ForegroundColor Gray
Write-Host ""

# Confirm deletion
$confirm = Read-Host "Delete these files? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    exit 0
}

# Delete files
$deleted = 0
$errors = 0
foreach ($file in $filesToDelete) {
    try {
        Remove-Item -Path $file.FullName -Force -ErrorAction Stop
        $deleted++
    } catch {
        Write-Host "Error deleting $($file.Name): $_" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "=== CLEANUP COMPLETE ===" -ForegroundColor Green
Write-Host "Deleted: $deleted files" -ForegroundColor Green
Write-Host "Freed: $sizeToDeleteMB MB ($sizeToDeleteGB GB)" -ForegroundColor Green
if ($errors -gt 0) {
    Write-Host "Errors: $errors files" -ForegroundColor Red
}
