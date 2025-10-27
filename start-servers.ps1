# Start All Servers Script
Write-Host "🚀 Starting Amach Health Servers..." -ForegroundColor Cyan

# Kill any existing Node processes
Write-Host "`n🔄 Stopping existing Node processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

Start-Sleep -Seconds 2

# Start Auth Server on port 3002
Write-Host "`n1️⃣ Starting Auth Server (port 3002)..." -ForegroundColor Green
$authServerJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\ogara\AmachHealth(S)\Amach-Website\auth-server"
    $env:PORT = "3002"
    node server.js
}

# Wait for auth server to start
Start-Sleep -Seconds 3

# Test auth server
try {
    $authResponse = Invoke-RestMethod -Uri "http://localhost:3002/health" -TimeoutSec 5
    Write-Host "✅ Auth Server running: $($authResponse.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Auth Server failed to start" -ForegroundColor Red
}

# Start Main App on port 3000 (clear PORT env var)
Write-Host "`n2️⃣ Starting Main App (port 3000)..." -ForegroundColor Green
$mainAppJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\ogara\AmachHealth(S)\Amach-Website"
    Remove-Item Env:\PORT -ErrorAction SilentlyContinue
    npm run dev:https
}

# Wait for main app to start
Start-Sleep -Seconds 8

# Test main app
try {
    $mainResponse = Invoke-WebRequest -Uri "https://localhost:3000" -SkipCertificateCheck -TimeoutSec 5
    if ($mainResponse.StatusCode -eq 200) {
        Write-Host "✅ Main App running on https://localhost:3000" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Main App failed to start on port 3000" -ForegroundColor Red
    Write-Host "   Trying to check what's running..." -ForegroundColor Yellow
    
    # Check what's actually running
    Get-NetTCPConnection -LocalPort 3000,3001,3002 -ErrorAction SilentlyContinue | 
        Format-Table LocalAddress,LocalPort,State -AutoSize
}

Write-Host "`n📊 Server Status:" -ForegroundColor Cyan
Write-Host "🔐 Auth Server:    http://localhost:3002" -ForegroundColor White
Write-Host "🌐 Main App:       https://localhost:3000" -ForegroundColor White
Write-Host "👤 Admin Dashboard: http://localhost:3001 (start separately)" -ForegroundColor White

Write-Host "`n🎯 Ready to test! Visit https://localhost:3000" -ForegroundColor Magenta

# Keep jobs running
Write-Host "`nPress Ctrl+C to stop all servers" -ForegroundColor Yellow
try {
    while ($true) {
        Start-Sleep -Seconds 10
        # Check if jobs are still running
        if ($authServerJob.State -ne "Running") {
            Write-Host "⚠️ Auth Server stopped" -ForegroundColor Yellow
        }
        if ($mainAppJob.State -ne "Running") {
            Write-Host "⚠️ Main App stopped" -ForegroundColor Yellow
        }
    }
} finally {
    Write-Host "`n🛑 Stopping all servers..." -ForegroundColor Red
    $authServerJob | Stop-Job
    $mainAppJob | Stop-Job
    $authServerJob | Remove-Job
    $mainAppJob | Remove-Job
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
}
