Start-Transcript -Path "C:\Codex\scratch\setup-startup.log" -Append

$User = "admin\admin"

Write-Host "Configuring OmniloginStartup scheduled task..."
$TriggerOmni = New-ScheduledTaskTrigger -AtLogOn
$ActionOmni = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Codex\scripts\start-omnilogin.ps1"
$SettingsOmni = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "OmniloginStartup" -Trigger $TriggerOmni -Action $ActionOmni -Settings $SettingsOmni -User $User -Force
Write-Host "OmniloginStartup task registered."

Write-Host "Configuring OmniloginTelegramBotKeepAlive scheduled task..."
$TriggerBotLogon = New-ScheduledTaskTrigger -AtLogOn
# Start the timer trigger 10 minutes in the past so it is active immediately
$startTime = (Get-Date).AddMinutes(-10)
$TriggerBotTime = New-ScheduledTaskTrigger -Once -At $startTime -RepetitionInterval (New-TimeSpan -Minutes 5)

$ActionBot = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Codex\scripts\start-telegram-bot.ps1"
$SettingsBot = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "OmniloginTelegramBotKeepAlive" -Trigger @($TriggerBotLogon, $TriggerBotTime) -Action $ActionBot -Settings $SettingsBot -User $User -Force
Write-Host "OmniloginTelegramBotKeepAlive task registered."

Stop-Transcript
