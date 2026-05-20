param(
  [string]$DeviceSerial = "",
  [switch]$LaunchApp,
  [string]$PackageName = "com.elderserve.caregiver",
  [string]$Activity = ".MainActivity"
)

$ErrorActionPreference = "Stop"

function Invoke-Adb {
  param([string[]]$Arguments, [switch]$AllowFailure)

  $fullArgs = @()
  if (-not [string]::IsNullOrWhiteSpace($DeviceSerial)) {
    $fullArgs += @("-s", $DeviceSerial)
  }
  $fullArgs += $Arguments

  & adb @fullArgs
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "adb failed: adb $($fullArgs -join ' ')"
  }
}

Invoke-Adb -Arguments @("wait-for-device")

# Keep emulator time deterministic: disable network auto time, set timezone, then set clock from host Beijing time.
Invoke-Adb -Arguments @("shell", "settings", "put", "global", "auto_time", "0") -AllowFailure
Invoke-Adb -Arguments @("shell", "settings", "put", "global", "auto_time_zone", "0") -AllowFailure
Invoke-Adb -Arguments @("shell", "settings", "put", "system", "time_12_24", "24") -AllowFailure
Invoke-Adb -Arguments @("shell", "cmd", "time_zone_detector", "set_time_zone_state_for_tests", "--zone_id", "Asia/Shanghai", "--user_should_confirm_id", "false") -AllowFailure
Invoke-Adb -Arguments @("shell", "su", "0", "setprop", "persist.sys.timezone", "Asia/Shanghai")

$beijingNow = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow, "China Standard Time")
$androidDate = $beijingNow.ToString("MMddHHmmyyyy.ss")
Invoke-Adb -Arguments @("shell", "su", "0", "date", $androidDate)

$timezone = (& adb $(if ($DeviceSerial) { @("-s", $DeviceSerial) } else { @() }) shell getprop persist.sys.timezone).Trim()
$deviceDate = (& adb $(if ($DeviceSerial) { @("-s", $DeviceSerial) } else { @() }) shell date).Trim()
$timeFormat = (& adb $(if ($DeviceSerial) { @("-s", $DeviceSerial) } else { @() }) shell settings get system time_12_24).Trim()

Write-Host "Emulator timezone: $timezone"
Write-Host "Emulator date: $deviceDate"
Write-Host "Emulator time format: $timeFormat"

if ($LaunchApp) {
  Invoke-Adb -Arguments @("shell", "am", "start", "-n", "$PackageName/$Activity")
}
