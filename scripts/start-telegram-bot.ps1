$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $root "dist\telegram-bot.js"
$stdout = Join-Path $root "telegram-bot.out.log"
$stderr = Join-Path $root "telegram-bot.err.log"
$startupLog = Join-Path $root "telegram-bot-startup.log"

$running = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*dist\telegram-bot.js*" }

if ($running) {
  $ids = ($running | ForEach-Object { $_.ProcessId }) -join ", "
  Add-Content -Path $startupLog -Value "[$(Get-Date -Format o)] telegram bot already running: $ids"
  exit 0
}

if (!(Test-Path $entry)) {
  Add-Content -Path $startupLog -Value "[$(Get-Date -Format o)] missing entry file: $entry"
  exit 1
}

Start-Process -FilePath "node.exe" `
  -ArgumentList "`"$entry`"" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr

Add-Content -Path $startupLog -Value "[$(Get-Date -Format o)] telegram bot started"
