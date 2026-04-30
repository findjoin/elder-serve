param(
  [string]$ApkPath = "caregiver-android\app\build\outputs\apk\debug\app-debug.apk",
  [string]$BaseUrl = $env:ELDER_CLOUD_BASE_URL,
  [string]$ApiKey = $env:ELDER_CLOUD_API_KEY,
  [int]$VersionCode = 1,
  [string]$VersionName = "1.0",
  [string]$Channel = "stable",
  [string]$ReleaseNotes = ""
)

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
