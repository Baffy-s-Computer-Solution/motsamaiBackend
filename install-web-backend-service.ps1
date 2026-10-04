# EasyGo Web Backend Windows Service Installer
# Run as Administrator

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
  Write-Host "ERROR: This script must run as Administrator" -ForegroundColor Red
  Write-Host "Right-click PowerShell and select 'Run as administrator'" -ForegroundColor Yellow
  exit 1
}

$serviceName = 'EasyGoWebBackend'
$displayName = 'EasyGo Web Backend'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$serverScript = 'C:\Users\Baokeng Khoali\easygo-platform-web\web-backend\server.js'

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "EasyGo Web Backend Service Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify Node.js exists
if (-not (Test-Path $nodeExe)) {
  Write-Host "ERROR: Node.js not found at $nodeExe" -ForegroundColor Red
  exit 1
}

# Verify server.js exists
if (-not (Test-Path $serverScript)) {
  Write-Host "ERROR: server.js not found at $serverScript" -ForegroundColor Red
  exit 1
}

# Remove existing service if present
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
  Write-Host "Removing existing service..." -ForegroundColor Yellow
  Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  cmd.exe /c "sc delete $serviceName" | Out-Null
  Start-Sleep -Seconds 1
}

# Create service
try {
  Write-Host "Creating service..." -ForegroundColor Cyan
  
  $serviceDir = Split-Path $serverScript
  $binPath = "`"$nodeExe`" `"$serverScript`""
  
  New-Service -Name $serviceName `
    -BinaryPathName $binPath `
    -DisplayName $displayName `
    -StartupType Automatic `
    -ErrorAction Stop | Out-Null
  
  # Set working directory for service (required for .env file discovery)
  $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
  Set-ItemProperty -Path $regPath -Name "AppDirectory" -Value $serviceDir -ErrorAction SilentlyContinue
  
  Write-Host "  Service created" -ForegroundColor Green
  
  Write-Host "Starting service..." -ForegroundColor Cyan
  Start-Service -Name $serviceName -ErrorAction Stop
  
  Start-Sleep -Seconds 2
  
  $status = Get-Service -Name $serviceName
  Write-Host "  Service started" -ForegroundColor Green
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "SUCCESS!" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "Service Name: $serviceName" -ForegroundColor Cyan
  Write-Host "Display Name: $displayName" -ForegroundColor Cyan
  Write-Host "Status: $($status.Status)" -ForegroundColor Cyan
  Write-Host "Startup Type: $($status.StartType)" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "The service will auto-start on next boot." -ForegroundColor Green
  Write-Host ""
  
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  exit 1
}
