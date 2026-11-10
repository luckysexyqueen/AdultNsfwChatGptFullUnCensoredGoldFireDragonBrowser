# Run in Windows PowerShell as Administrator
$ErrorActionPreference = 'Stop'
$repo = 'luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser'
$runnerName = 'goldfiredragon-vpn-runner'
$ubuntu = 'Ubuntu-24.04'
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'WSL is not available. Update Windows and enable WSL first.' }
$distros = @(wsl.exe --list --quiet 2>$null | ForEach-Object { ($_ -replace '\x00','').Trim() })
if ($distros -notcontains $ubuntu) {
  Write-Host 'Installing Ubuntu 24.04. A reboot and Ubuntu first-time user setup may be required.'
  wsl.exe --install -d $ubuntu
  Write-Host 'After Ubuntu setup finishes, rerun this script.'
  exit
}
Write-Host 'Open GitHub registration page and copy the short-lived token:'
Write-Host "https://github.com/$repo/settings/actions/runners/new"
$token = Read-Host 'GitHub runner registration token (not saved)'
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Registration token is required.' }
$env:GFD_RUNNER_TOKEN = $token
$linux = @'
set -euo pipefail
sudo apt-get update
sudo apt-get install -y curl jq tar git openvpn ca-certificates
mkdir -p "$HOME/goldfiredragon-runner"
cd "$HOME/goldfiredragon-runner"
if [ ! -f config.sh ]; then
  url=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r '.assets[] | select(.name | test("^actions-runner-linux-x64-[0-9.]+\\.tar\\.gz$")) | .browser_download_url' | head -n1)
  [ -n "$url" ] || { echo "Cannot find Linux x64 runner asset"; exit 1; }
  curl -fL "$url" -o runner.tar.gz
  tar xzf runner.tar.gz
  rm runner.tar.gz
fi
if [ ! -f .runner ]; then
  ./config.sh --unattended --url "https://github.com/REPO_PLACEHOLDER" --token "$GFD_RUNNER_TOKEN" --name goldfiredragon-vpn-runner --labels goldfiredragon-vpn --work _work
fi
echo "Runner configured. Start with: cd ~/goldfiredragon-runner && ./run.sh"
'@.Replace('REPO_PLACEHOLDER',$repo)
$env:GFD_RUNNER_SCRIPT = $linux
# WSL environment forwarding of secrets is avoided: script/token passed via stdin only.
$payload = $linux.Replace('$GFD_RUNNER_TOKEN',("'"+$token.Replace("'","'\''")+"'"))
try { $payload | wsl.exe -d $ubuntu -- bash -s } finally { Remove-Item Env:GFD_RUNNER_TOKEN -ErrorAction SilentlyContinue; Remove-Item Env:GFD_RUNNER_SCRIPT -ErrorAction SilentlyContinue }
Write-Host 'To run the runner: wsl -d Ubuntu-24.04 -- bash -lc "cd ~/goldfiredragon-runner && ./run.sh"'
