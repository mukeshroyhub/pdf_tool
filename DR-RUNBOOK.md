# Disaster Recovery Runbook — PDF Tool

Goal: if the EC2 instance dies (hardware failure, accidental termination,
corrupted box), restore the live service on a fresh instance in **under 30
minutes**. The architecture makes this possible because the box is stateless:
user files live in browsers, accounts in Neon, staging in Supabase. Losing the
instance loses **nothing** except uptime.

Rehearse this once (a "DR drill") so the first real recovery isn't also the
first attempt. During the drill, build the new box fully and verify it, THEN
move DNS — total user-visible downtime in a real event is only the DNS step.

## What you need in hand (keep safe, off the server)

| Item | Where it lives |
|---|---|
| This repo | github.com/mukeshroyhub/pdf_tool (public code) |
| `.env` values | Copy the live `.env` somewhere safe NOW: password manager or encrypted USB. Without it you'll re-collect Neon/Supabase/Brevo/Google values from their dashboards (possible, slower). |
| Font files | `fonts-custom/*.ttf` — also in your local repo folder |
| SSH key | `pdf-tool-key.pem` (or create a new key pair at launch) |
| DuckDNS login | for the DNS repoint |

**Do now, before any disaster:** from PowerShell, back up the live `.env`:

```
scp -i "C:\Users\TEI-1420\Downloads\pdf-tool-key.pem" ubuntu@13.50.135.60:~/pdf_tool/.env "C:\Users\TEI-1420\Downloads\pdf tool\pdftool-env-backup.txt"
```

Store that file in a password manager or encrypted location — it contains all
production secrets.

## Recovery procedure (target: 30 min)

Times assume the drill has been done once. Start the clock.

### 1. Launch instance (5 min)
AWS Console → EC2 → Launch: Ubuntu LTS, t3.micro, existing key pair,
security group allowing 22 (My IP), 80, 443 (anywhere), **30 GB gp3** root.

### 2. Base setup (5 min)
Connect via EC2 Instance Connect. Then:

```
bind 'set enable-bracketed-paste off'
sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl enable --now docker
sudo mkdir -p /usr/local/lib/docker/cli-plugins && sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
sudo usermod -aG docker ubuntu && newgrp docker
```

(If the root disk shows small in `df -h /`: `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`.)

### 3. Code + config (3 min)
```
git clone https://github.com/mukeshroyhub/pdf_tool.git && cd pdf_tool
mkdir -p fonts-custom
nano .env        # paste the backed-up .env contents
```
From your PC, restore fonts:
```
scp -i <key.pem> "C:\Users\TEI-1420\Downloads\pdf tool\pdfforge\fonts-custom\*.ttf" ubuntu@NEW_IP:~/pdf_tool/fonts-custom/
```

### 4. Build & start (15 min, mostly waiting)
```
docker compose -f docker-compose.oracle.yml up -d --build
```
While it builds: **re-associate the Elastic IP** (EC2 → Elastic IPs →
13.50.135.60 → Associate → new instance). Because DNS points at the Elastic
IP, no DuckDNS change is needed in a real recovery — this is why the Elastic
IP matters. (If the Elastic IP was lost too: allocate a new one and update
DuckDNS instead.)

### 5. Verify (2 min)
- `docker compose -f docker-compose.oracle.yml ps` → 3 containers Up
- `https://pdftool4u.duckdns.org/api/health` → status ok (cert renews automatically)
- Sign in with Google, upload a PDF, run one tool, download.

### 6. Post-recovery
- Terminate the dead instance (avoid double billing).
- UptimeRobot should already show recovery; check the alert history.
- Note the drill/recovery time below.

## Drill log

| Date | Type | Time taken | Notes |
|---|---|---|---|
| _(fill after first drill)_ | Drill | | |
