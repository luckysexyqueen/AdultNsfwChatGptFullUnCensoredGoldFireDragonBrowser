# GoldFireDragon — Oracle Cloud Always Free Node.js server

Create an **Always Free eligible** Ubuntu ARM64 Ampere A1 VM in your Oracle Cloud home region, within the account's free limits. Assign a public IP. VM capacity is not guaranteed; idle VMs may be reclaimed.

SSH into the VM and run:

```bash
git clone --depth 1 --branch fix/free-api-local-gguf-engine-20261018 https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser.git
cd AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser
bash deploy/oracle-always-free/install.sh
```

This installs Node.js, builds site-dist, registers a systemd service that restarts after crashes/reboots, and proxies port 80 via Nginx. Oracle VCN ingress TCP 80 must be configured. HTTPS requires a domain and TLS configuration; do not expose sensitive data over plain HTTP. No Cloudflare API token is needed for this VM.

Test: `systemctl status goldfiredragon`, `curl http://127.0.0.1:8787/api/gateway/status`.

To update: rerun `bash deploy/oracle-always-free/install.sh` inside the checkout.

Oracle Cloud VM provisioning and account registration must be completed by the account owner. This repository change alone does not create a VM or make a public URL live.
