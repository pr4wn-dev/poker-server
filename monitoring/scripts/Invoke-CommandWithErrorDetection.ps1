# Invoke-CommandWithErrorDetection
# Wraps command execution and automatically detects errors, writes to prompts-for-user.txt

function Invoke-CommandWithErrorDetection {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Command,
        
        [Parameter(Mandatory=$false)]
        [string]$WorkingDirectory = $PWD,
        
        [Parameter(Mandatory=$false)]
        [switch]$NoErrorDetection
    )
    
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $monitoringDir = Split-Path -Parent $scriptDir
    $projectRoot = Split-Path -Parent $monitoringDir
    
    # Execute command
    try {
        Push-Location $WorkingDirectory
        $output = Invoke-Expression $Command 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        Pop-Location
        
        # If error detection is disabled, just return output
        if ($NoErrorDetection) {
            return @{
                Success = $exitCode -eq 0
                Output = $output
                ExitCode = $exitCode
            }
        }
        
        # Check for errors and monitor
        if ($exitCode -ne 0 -or $output -match 'Error:|SyntaxError|ReferenceError|TypeError|Invalid string escape') {
            # DATABASE APPROACH: Write to temp file (like Add-PendingIssue) to avoid encoding issues
            try {
                $commandData = @{
                    command = $Command
                    output = $output
                    exitCode = $exitCode
                    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                }
                
                $jsonData = $commandData | ConvertTo-Json -Compress -Depth 10
                
                # Verify JSON is valid
                try {
                    $null = $jsonData | ConvertFrom-Json -ErrorAction Stop
                } catch {
                    Write-Warning "Failed to create valid JSON for terminal command: $_"
                    return @{
                        Success = $exitCode -eq 0
                        Output = $output
                        ExitCode = $exitCode
                    }
                }
                
                $tempFile = Join-Path $env:TEMP "terminal-command-$(Get-Date -Format 'yyyyMMddHHmmss')-$(Get-Random).json"
                [System.IO.File]::WriteAllText($tempFile, $jsonData, [System.Text.UTF8Encoding]::new($false))
                Start-Sleep -Milliseconds 100
                
                # Call HTTP server with temp file path
                $filePathEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($tempFile))
                $uri = "http://127.0.0.1:3001/monitor-terminal-command?file=$filePathEncoded"
                $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
                
                if ($response) {
                    $result = $response.Content | ConvertFrom-Json
                    if ($result.success -and $result.errorsDetected -gt 0) {
                        Write-Host "⚠️  Terminal error detected! Check logs\prompts-for-user.txt" -ForegroundColor Yellow
                    }
                }
                
                # Clean up temp file after processing
                if (Test-Path $tempFile) {
                    Start-Sleep -Milliseconds 500
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                }
            } catch {
                # HTTP server might not be running - that's okay
            }
        }
        
        return @{
            Success = $exitCode -eq 0
            Output = $output
            ExitCode = $exitCode
        }
    } catch {
        Pop-Location
        $errorOutput = $_.Exception.Message
        $exitCode = 1
        
        # Monitor error (DATABASE APPROACH: temp file)
        try {
            $commandData = @{
                command = $Command
                output = $errorOutput
                exitCode = 1
                timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            }
            
            $jsonData = $commandData | ConvertTo-Json -Compress -Depth 10
            
            try {
                $null = $jsonData | ConvertFrom-Json -ErrorAction Stop
            } catch {
                # Skip if JSON invalid
            }
            
            $tempFile = Join-Path $env:TEMP "terminal-command-$(Get-Date -Format 'yyyyMMddHHmmss')-$(Get-Random).json"
            [System.IO.File]::WriteAllText($tempFile, $jsonData, [System.Text.UTF8Encoding]::new($false))
            Start-Sleep -Milliseconds 100
            
            $filePathEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($tempFile))
            $uri = "http://127.0.0.1:3001/monitor-terminal-command?file=$filePathEncoded"
            $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            
            if (Test-Path $tempFile) {
                Start-Sleep -Milliseconds 500
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            }
        } catch {
            # HTTP server might not be running
        }
        
        return @{
            Success = $false
            Output = $errorOutput
            ExitCode = 1
        }
    }
}
