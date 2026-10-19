$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser'
$version = '2.337.0'
$expectedHash = '1150692afa94e71f872017e254ea55b6eece1eece3fe7e3a6d4c93d0a1b85cfc'
if (-not $env:RUNNER_TOKEN) { throw 'Set a fresh RUNNER_TOKEN environment variable locally. Never commit the token.' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Windows x64 is required' }
$dir = Join-Path $env:USERPROFILE 'actions-runner-gfd-x64'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
if (-not (Test-Path '.\config.cmd')) {
  $archive = Join-Path $dir 'runner.zip'
  Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/download/v$version/actions-runner-win-x64-$version.zip" -OutFile $archive
  $hash = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash
  if ($hash -ne $expectedHash) { throw 'Runner checksum mismatch' }
  Expand-Archive -LiteralPath $archive -DestinationPath $dir -Force
  Remove-Item $archive
}
if (-not (Test-Path '.\.runner')) {
  & .\config.cmd --unattended --url $repo --token $env:RUNNER_TOKEN --name 'goldfiredragon-windows-x64' --labels 'windows-build,android-build' --work '_work'
  if ($LASTEXITCODE -ne 0) { throw 'Runner registration failed' }
}
& .\run.cmd
