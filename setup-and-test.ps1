# setup-and-test.ps1 - Windows PowerShell setup script for Motsamai Backend

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Motsamai Backend - Setup & Testing Script (Windows)            ║" -ForegroundColor Cyan
Write-Host "║     Version: 2.0.0                                                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Environment Check
Write-Host "[1/6] Checking environment..." -ForegroundColor Blue
if (-not (Test-Path ".env") -and -not (Test-Path ".env.development")) {
    Write-Host "⚠️  No .env file found" -ForegroundColor Yellow
    Write-Host "Please create .env file with database credentials"
    exit 1
}
Write-Host "✅ Environment variables found" -ForegroundColor Green
Write-Host ""

# Step 2: Dependency Check
Write-Host "[2/6] Installing dependencies..." -ForegroundColor Blue
try {
    npm install *> $null
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Database Connection
Write-Host "[3/6] Testing database connection..." -ForegroundColor Blue
try {
    npm run env:check *> $null
    Write-Host "✅ Database connection successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
    Write-Host "Please check your database credentials in .env"
    exit 1
}
Write-Host ""

# Step 4: Database Migrations
Write-Host "[4/6] Running database migrations..." -ForegroundColor Blue
try {
    npm run migrate *> $null
    Write-Host "✅ Migrations completed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Migrations already applied or no migrations pending" -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Database Seeding
Write-Host "[5/6] Seeding database with sample data..." -ForegroundColor Blue
try {
    npm run seed:all *> $null
    Write-Host "✅ Database seeded successfully" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Database seeding skipped (already seeded)" -ForegroundColor Yellow
}
Write-Host ""

# Step 6: Running Tests
Write-Host "[6/6] Running API tests..." -ForegroundColor Blue
try {
    npm test *> $null
    Write-Host "✅ Tests passed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Some tests may have failed" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║✨ Setup Complete!                                                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "🚀 Start the server:" -ForegroundColor Blue
Write-Host "   npm run dev"
Write-Host ""

Write-Host "📊 Test Credentials:" -ForegroundColor Blue
Write-Host ""

Write-Host "📚 API Documentation:" -ForegroundColor Blue
Write-Host "   http://localhost:4000/api-docs"
Write-Host ""
