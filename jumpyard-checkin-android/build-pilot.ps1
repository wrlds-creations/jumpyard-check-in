param(
    [string]$SigningDirectory = (Join-Path $env:USERPROFILE '.codex/signing/jumpyard-staff')
)
$ErrorActionPreference = 'Stop'
$credentialFile = Join-Path $SigningDirectory 'pilot-credential.xml'
$keyStore = Join-Path $SigningDirectory 'pilot-signing.p12'
if (!(Test-Path -LiteralPath $credentialFile) -or !(Test-Path -LiteralPath $keyStore)) {
    throw 'Signing material is missing. Follow README.md; never substitute the Android debug key.'
}
$credential = Import-Clixml -LiteralPath $credentialFile
if ($credential -isnot [Management.Automation.PSCredential]) { throw 'Invalid signing credential.' }
$names = @('JY_ANDROID_KEYSTORE', 'JY_ANDROID_STORE_PASSWORD', 'JY_ANDROID_KEY_ALIAS', 'JY_ANDROID_KEY_PASSWORD')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:JY_ANDROID_KEYSTORE = $keyStore
    $env:JY_ANDROID_STORE_PASSWORD = $credential.GetNetworkCredential().Password
    $env:JY_ANDROID_KEY_PASSWORD = $env:JY_ANDROID_STORE_PASSWORD
    $env:JY_ANDROID_KEY_ALIAS = $credential.UserName
    & (Join-Path $PSScriptRoot 'gradlew.bat') -p $PSScriptRoot lintDebug lintRelease testDebugUnitTest testReleaseUnitTest assemblePilot --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android validation/build failed.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $credential = $null
}
