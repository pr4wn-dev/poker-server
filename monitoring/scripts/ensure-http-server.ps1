# Ensure HTTP Integration Server is Running
# Helper script to start the HTTP server if it's not running
# Used by workflow compliance system

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$monitoringDir = Split-Path -Parent $scriptDir
$httpServerScript = Join-Path $monitoringDir "integration\BrokenPromise-integration-http.js"
$port = 3001

# Check if server is running
function Test-HttpServerRunning {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/ping" -TimeoutSec 2 -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# Start the server
function Start-HttpServer {
    if (Test-HttpServerRunning) {
        return $true
    }
    
    if (!(Test-Path $httpServerScript)) {
        Write-Error "HTTP server script not found: $httpServerScript"
        return $false
    }
    
    try {
        Start-Process powershell -ArgumentList "-NoProfile", "-Command", "cd '$monitoringDir'; node integration\BrokenPromise-integration-http.js" -WindowStyle Hidden
        Start-Sleep -Seconds 2
        
        # Wait for server to be ready
        $maxWait = 10
        $waited = 0
        while ($waited -lt $maxWait) {
            if (Test-HttpServerRunning) {
                return $true
            }
            Start-Sleep -Milliseconds 500
            $waited += 0.5
        }
        
        Write-Warning "HTTP server did not become ready within $maxWait seconds"
        return $false
    } catch {
        Write-Error "Failed to start HTTP server: $_"
        return $false
    }
}

# Main: Ensure server is running
if (Start-HttpServer) {
    Write-Host "HTTP integration server is running on port $port"
    exit 0
} else {
    Write-Error "Failed to start HTTP integration server"
    exit 1
}
