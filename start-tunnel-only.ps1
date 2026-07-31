# Start LocalTunnel only (if backend is already running)
# شغال tunnel لو الباك إند شغال بالفعل

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🔗 Cipher LocalTunnel" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "👉 افترض إن الباك إند شغال على port 3001" -ForegroundColor Yellow
Write-Host ""
Write-Host "   👇 الرابط اللي هيظهر هو اللي تضيفه في Vercel" -ForegroundColor Cyan
Write-Host "   https://vercel.com/ebrahimelkordys-projects/sanad-atomic-ledger/settings/environment-variables" -ForegroundColor Cyan
Write-Host ""
Write-Host "   عايز توقف؟ اضغط Ctrl+C" -ForegroundColor Yellow
Write-Host ""

npx localtunnel --port 3001 2>&1
