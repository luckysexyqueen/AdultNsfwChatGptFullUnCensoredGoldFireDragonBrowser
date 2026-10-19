#!/usr/bin/env bash
set -euo pipefail
REPO_URL="https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser"
VERSION="2.337.0"
ARCH="$(uname -m)"
[[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] || { echo "Requires Linux ARM64, got $ARCH"; exit 2; }
: "${RUNNER_TOKEN:?Set a newly generated RUNNER_TOKEN locally; do not commit it}"
mkdir -p "$HOME/actions-runner-gfd-arm64"
cd "$HOME/actions-runner-gfd-arm64"
if [[ ! -f ./config.sh ]]; then
  curl -fL --retry 3 -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-arm64-${VERSION}.tar.gz"
  echo "9b1dc70626422526e3c94767cf024896beb15da5342a3f4819bf2feac13e0393  runner.tar.gz" | sha256sum -c -
  tar xzf runner.tar.gz
  rm runner.tar.gz
fi
if [[ ! -f .runner ]]; then
  ./config.sh --unattended --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "goldfiredragon-linux-arm64" --labels "goldfiredragon-vpn,android-arm64" --work "_work"
fi
exec ./run.sh
