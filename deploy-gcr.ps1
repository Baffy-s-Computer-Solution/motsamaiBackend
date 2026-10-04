param(
    [string]$ProjectId = "easygols",
    [string]$ServiceName = "easygo-backend",
    [string]$Region = "asia-southeast1"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying $ServiceName to Cloud Run..." -ForegroundColor Cyan

function Get-GcloudCommand {
    $cmd = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($cmd) { return "gcloud" }

    $candidates = @(
        "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:USERPROFILE\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:USERPROFILE\google-cloud-sdk\google-cloud-sdk\bin\gcloud.cmd"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }

    throw "gcloud CLI not found. Install Google Cloud SDK first."
}

$gcloud = Get-GcloudCommand

& $gcloud config set project $ProjectId | Out-Null

& $gcloud run deploy $ServiceName `
  --source . `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --cpu 1 `
  --memory 512Mi `
  --min-instances 0 `
  --max-instances 1 `
  --set-env-vars NODE_ENV=production,FIREBASE_USE_ADC=true,FIREBASE_PROJECT_ID=$ProjectId,FIREBASE_DATABASE_URL=https://easygols-default-rtdb.asia-southeast1.firebasedatabase.app

$url = & $gcloud run services describe $ServiceName --region $Region --format="value(status.url)"

Write-Host "Deployment completed." -ForegroundColor Green
Write-Host "Service URL: $url" -ForegroundColor Green
Write-Host "Health URL: $url/health" -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing
    Write-Host "Health check status: $($response.StatusCode)" -ForegroundColor Green
}
catch {
    Write-Host "Health check failed. Check Cloud Run logs." -ForegroundColor Red
}
