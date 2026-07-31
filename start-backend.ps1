# Start Cipher Backend + LocalTunnel
# تشغيل الباك إند مع tunnel عشان يتصل بـ Vercel

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🚀 Cipher Backend + Tunnel Launcher" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Check if .env exists
if (-not (Test-Path "apps/backend/.env")) {
    Write-Host "⚠️  apps/backend/.env not found!" -ForegroundColor Yellow
    Write-Host "👉 Copy .env.example to apps/backend/.env first" -ForegroundColor Yellow
    exit 1
}

# 2. Start Backend in background
Write-Host "📦 Starting Backend on port 3001..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    cd apps/backend
    npm run start:dev 2>&1
}
Write-Host "   ✅ Backend started (PID: $($backendJob.Id))" -ForegroundColor Green
Write-Host ""

# Wait a bit for backend to start
Start-Sleep -Seconds 5

# 3. Start LocalTunnel
Write-Host "🔗 Opening tunnel to internet..." -ForegroundColor Green
Write-Host "   عايز توقف؟ اضغط Ctrl+C في التيرمنال ده" -ForegroundColor Yellow
Write-Host ""
Write-Host "   👇 الرابط اللي هيتولد هو اللي هتضيفه في Vercel كـ NEXT_PUBLIC_API_BASE_URL" -ForegroundColor Cyan
Write-Host "   (روح https://vercel.com → Project Settings → Environment Variables) " -ForegroundColor Cyan
Write-Host ""

# Run localtunnel
npx localtunnel --port 3001 --subdomain cipher-api 2>&1

# Cleanup when user presses Ctrl+C
Write-Host ""
Write-Host "🧹 Stopping backend..." -ForegroundColor Yellow
Stop-Job $backendJob
Remove-Job $backendJob
Write-Host "✅ Done!" -ForegroundColor Green
