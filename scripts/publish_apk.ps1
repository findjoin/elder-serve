param(
  [string]$ApkPath = "caregiver-android\app\build\outputs\apk\debug\app-debug.apk",
  [string]$BaseUrl = $env:ELDER_CLOUD_BASE_URL,
  [string]$ApiKey = $env:ELDER_CLOUD_API_KEY,
  [int]$VersionCode = 0,
  [string]$VersionName = "",
  [string]$Channel = "stable",
  [string]$ReleaseNotes = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$gradlePropsFile = Join-Path $scriptDir "..\caregiver-android\gradle.properties"

function Read-GradleProperty {
  param([string]$FilePath, [string]$Key, [string]$Default = "")
  if (-not (Test-Path $FilePath)) { return $Default }
  $match = Select-String -Path $FilePath -Pattern "^$Key=(.+)" | Select-Object -First 1
  if ($match) { return $match.Matches[0].Groups[1].Value.Trim() }
  return $Default
}

if (-not $PSBoundParameters.ContainsKey('VersionCode') -or $VersionCode -eq 0) {
  $code = Read-GradleProperty -FilePath $gradlePropsFile -Key "appVersionCode"
  if ($code -and [int]::TryParse($code, [ref]$null)) {
    $VersionCode = [int]$code
  }
  if ($VersionCode -eq 0) {
    throw "VersionCode not specified. Pass -VersionCode or set appVersionCode in caregiver-android/gradle.properties."
  }
}

if (-not $PSBoundParameters.ContainsKey('VersionName') -or [string]::IsNullOrWhiteSpace($VersionName)) {
  $name = Read-GradleProperty -FilePath $gradlePropsFile -Key "appVersionName"
  if ($name) { $VersionName = $name }
  if ([string]::IsNullOrWhiteSpace($VersionName)) {
    throw "VersionName not specified. Pass -VersionName or set appVersionName in caregiver-android/gradle.properties."
  }
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  throw "Missing BaseUrl. Pass -BaseUrl or set ELDER_CLOUD_BASE_URL."
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Missing ApiKey. Pass -ApiKey or set ELDER_CLOUD_API_KEY."
}

$resolvedApk = Resolve-Path -LiteralPath $ApkPath
$uri = "$($BaseUrl.TrimEnd('/'))/api/app-releases"

& curl.exe -sS -X POST $uri `
  -H "x-api-key: $ApiKey" `
  -F "apk=@$resolvedApk;type=application/vnd.android.package-archive" `
  -F "versionCode=$VersionCode" `
  -F "versionName=$VersionName" `
  -F "platform=android" `
  -F "channel=$Channel" `
  -F "releaseNotes=$ReleaseNotes" `
  -F "forceUpdate=false"
