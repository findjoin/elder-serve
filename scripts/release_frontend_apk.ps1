param(
  [string]$BaseUrl = $env:ELDER_CLOUD_BASE_URL,
  [string]$ApiKey = $env:ELDER_CLOUD_API_KEY,
  [string]$ReleaseNotes = "frontend update",
  [switch]$SkipVersionBump,
  [switch]$SkipCloudUpload,
  [switch]$SkipEmulatorInstall
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path -LiteralPath (Join-Path $scriptDir "..")
$gradlePropsFile = Join-Path $repoRoot "caregiver-android\gradle.properties"
$androidDir = Join-Path $repoRoot "caregiver-android"
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

function Read-GradleProperty {
  param([string]$FilePath, [string]$Key)
  $match = Select-String -Path $FilePath -Pattern "^$Key=(.+)$" | Select-Object -First 1
  if ($match) { return $match.Matches[0].Groups[1].Value.Trim() }
  return ""
}

function Set-GradleProperty {
  param([string]$FilePath, [string]$Key, [string]$Value)
  $lines = Get-Content -LiteralPath $FilePath
  $found = $false
  $next = $lines | ForEach-Object {
    if ($_ -match "^$Key=") {
      $found = $true
      "$Key=$Value"
    } else {
      $_
    }
  }
  if (-not $found) {
    $next += "$Key=$Value"
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($FilePath, $next, $utf8NoBom)
}

$versionCode = [int](Read-GradleProperty -FilePath $gradlePropsFile -Key "appVersionCode")
$versionName = Read-GradleProperty -FilePath $gradlePropsFile -Key "appVersionName"

if (-not $SkipVersionBump) {
  $versionCode += 1
  $parts = $versionName.Split(".")
  if ($parts.Length -ge 2 -and [int]::TryParse($parts[-1], [ref]$null)) {
    $patch = [int]$parts[-1] + 1
    $versionName = (($parts[0..($parts.Length - 2)] + @([string]$patch)) -join ".")
  } else {
    $versionName = "4.$versionCode"
  }
  Set-GradleProperty -FilePath $gradlePropsFile -Key "appVersionCode" -Value $versionCode
  Set-GradleProperty -FilePath $gradlePropsFile -Key "appVersionName" -Value $versionName
  Write-Host "Version bumped to $versionName ($versionCode)"
}

Push-Location $androidDir
try {
  .\gradlew.bat clean assembleDebug `
    -PcloudApiBaseUrl="$BaseUrl" `
    -PcloudApiKey="$ApiKey"
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $apkPath)) {
  throw "APK not found: $apkPath"
}

if (-not $SkipCloudUpload) {
  & (Join-Path $scriptDir "publish_apk.ps1") `
    -ApkPath $apkPath `
    -BaseUrl $BaseUrl `
    -ApiKey $ApiKey `
    -VersionCode $versionCode `
    -VersionName $versionName `
    -ReleaseNotes $ReleaseNotes
}

if (-not $SkipEmulatorInstall) {
  $devices = (& adb devices) -match "`tdevice$"
  if (-not $devices) {
    throw "No adb device is online. Start the emulator before installing."
  }
  & adb uninstall com.elderserve.caregiver | Out-Host
  & adb install $apkPath | Out-Host
  & (Join-Path $scriptDir "sync_emulator_beijing_time.ps1") -LaunchApp | Out-Host
}

Write-Host "Release complete: $versionName ($versionCode)"
