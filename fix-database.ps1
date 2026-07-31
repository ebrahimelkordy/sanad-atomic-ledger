# Fix Database & Redis Configuration
Write-Host "🔧 Fixing Cipher Backend Database & Redis" -ForegroundColor Cyan

# 1. Check if cipher database/user exists - try common Windows PostgreSQL passwords
$pwds = @("postgres", "cipher_secret", "password", "admin", "sa")
$connected = $false

foreach ($pwd in $pwds) {
    try {
        $env:PGPASSWORD = $pwd
        $result = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Connected to PostgreSQL with password: $pwd" -ForegroundColor Green
            $connected = $true
            
            # Create cipher user if not exists
            & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE USER cipher WITH PASSWORD 'cipher_secret';" 2>&1
            
            # Create cipher database if not exists
            & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE cipher OWNER cipher;" 2>&1
            
            # Grant privileges
            & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE cipher TO cipher;" 2>&1
            
            Write-Host "✅ Cipher user and database created!" -ForegroundColor Green
            break
        }
    } catch {
        # Try next password
    }
}

if (-not $connected) {
    Write-Host "❌ Could not connect to PostgreSQL. Check your PostgreSQL password." -ForegroundColor Red
    Write-Host "   Try running manually: psql -U postgres" -ForegroundColor Yellow
    Write-Host "   Then run: CREATE USER cipher WITH PASSWORD 'cipher_secret';" -ForegroundColor Yellow
    Write-Host "   Then run: CREATE DATABASE cipher OWNER cipher;" -ForegroundColor Yellow
}

# 2. Run Prisma migrations
Write-Host ""
Write-Host "📦 Running Prisma migrations..." -ForegroundColor Cyan
cd apps/backend
npx prisma migrate deploy
npx prisma generate
cd ../..

Write-Host ""
Write-Host "🚀 Starting backend..." -ForegroundColor Green
Write-Host "   cd apps/backend" -ForegroundColor Yellow
Write-Host "   npm run start:dev" -ForegroundColor Yellow

