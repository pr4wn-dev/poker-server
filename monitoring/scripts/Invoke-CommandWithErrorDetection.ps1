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
            # Call HTTP server to monitor error
            try {
                # CRITICAL FIX: Send as JSON array in args parameter (not separate query params)
                # This ensures the HTTP server receives all data correctly
                $argsArray = @($Command, $output, $exitCode) | ConvertTo-Json -Compress
                $argsEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($argsArray))
                
                $uri = "http://127.0.0.1:3001/monitor-terminal-command?args=$argsEncoded"
                $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
                
                if ($response) {
                    $result = $response.Content | ConvertFrom-Json
                    if ($result.success -and $result.errorsDetected -gt 0) {
                        Write-Host "⚠️  Terminal error detected! Check logs\prompts-for-user.txt" -ForegroundColor Yellow
                    }
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
        
        # Monitor error
        try {
            # CRITICAL FIX: Send as JSON array in args parameter (not separate query params)
            $argsArray = @($Command, $errorOutput, 1) | ConvertTo-Json -Compress
            $argsEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($argsArray))
            
            $uri = "http://127.0.0.1:3001/monitor-terminal-command?args=$argsEncoded"
            $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
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
