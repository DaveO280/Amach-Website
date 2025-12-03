# Clean reinstall script for pnpm (PowerShell)

Write-Host "🧹 Cleaning up..." -ForegroundColor Cyan

# Remove node_modules
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "✅ Removed node_modules" -ForegroundColor Green
}

# Remove .next build directory
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "✅ Removed .next" -ForegroundColor Green
}

# Remove package-lock.json if it exists (should use pnpm-lock.yaml instead)
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
    Write-Host "✅ Removed package-lock.json (using pnpm instead)" -ForegroundColor Green
}

Write-Host "📦 Installing with pnpm..." -ForegroundColor Cyan
pnpm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Installation complete!" -ForegroundColor Green
} else {
    Write-Host "❌ Installation failed. Try: pnpm install --shamefully-hoist" -ForegroundColor Red
}

