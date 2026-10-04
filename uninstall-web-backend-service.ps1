$serviceName = 'EasyGoWebBackend'

Write-Host "Stopping service '$serviceName' if it exists..."
try {
  sc.exe stop $serviceName | Out-Null
} catch {
}

Write-Host "Deleting service '$serviceName'..."
try {
  sc.exe delete $serviceName
  Write-Host "Service '$serviceName' deleted successfully."
} catch {
  Write-Error "Failed to delete service. Run this script as Administrator."
  exit 1
}
