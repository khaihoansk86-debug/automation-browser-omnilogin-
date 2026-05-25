$ErrorActionPreference = "Stop"

$exe = "$env:LOCALAPPDATA\Programs\omnilogin\Omnilogin.exe"
$log = Join-Path (Split-Path -Parent $PSScriptRoot) "omnilogin-startup.log"

Start-Sleep -Seconds 20

$running = Get-CimInstance Win32_Process -Filter "name = 'Omnilogin.exe'" -ErrorAction SilentlyContinue
if ($running) {
  $ids = ($running | ForEach-Object { $_.ProcessId }) -join ", "
  Add-Content -Path $log -Value "[$(Get-Date -Format o)] Omnilogin already running: $ids"
  exit 0
}

if (!(Test-Path $exe)) {
  Add-Content -Path $log -Value "[$(Get-Date -Format o)] missing Omnilogin exe: $exe"
  exit 1
}

Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
Add-Content -Path $log -Value "[$(Get-Date -Format o)] Omnilogin started"
