# Deploying PDF Tool to AWS EC2 (Free Tier)

AWS EC2 is just an Ubuntu VM, so the same files used for the Oracle deploy work
here unchanged: `docker-compose.oracle.yml`, `Caddyfile`, and a `.env` built from
`.env.oracle.example`. The database stays on Neon and files on Supabase, so the
instance is pure compute.

## Honest trade-offs (read first)

- **RAM:** the free-tier t2.micro / t3.micro has **1 GB RAM** — tight. A swap
  file is REQUIRED (the Next.js build needs ~1.5 GB). Heavy PDF ops
  (compress/redact) will be slower than on a bigger box.
- **Free for 12 months only**, then billed (~$8–10/mo for the instance).
  Oracle Always-Free (12 GB) is free forever — consider it if cost matters.
- Everything else (features, HTTPS, auth) works exactly the same.

---

## Phase 1 — Launch the EC2 instance

1. **console.aws.amazon.com** → sign in → search **EC2** → **Launch instance**.
2. Name: `pdftool`.
3. **AMI:** Ubuntu Server 22.04 LTS (Free tier eligible).
4. **Instance type:** `t2.micro` or `t3.micro` (whichever shows "Free tier eligible").
5. **Key pair:** Create a new key pair → download the `.pem` file (you SSH with it).
6. **Network settings** → Edit → **Allow SSH (22) from My IP**, and add rules:
   - **HTTP (80)** from Anywhere (0.0.0.0/0)
   - **HTTPS (443)** from Anywhere (0.0.0.0/0)
7. **Storage:** 30 GB gp3 (free tier includes 30 GB).
8. **Launch instance.** When it's running, copy its **Public IPv4 address**.

> Tip: allocate an **Elastic IP** and associate it with the instance so the IP
> doesn't change on stop/start (free while attached to a running instance).

## Phase 2 — Connect

From PowerShell where you saved the `.pem`:
```
icacls "your-key.pem" /inheritance:r /grant:r "%USERNAME%:R"   # fix key perms (Windows)
ssh -i "your-key.pem" ubuntu@YOUR_PUBLIC_IP
```
(Type `yes` to trust the host.)

## Phase 3 — Add swap (REQUIRED on 1 GB)

```
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # confirm 3.0Gi swap
```

## Phase 4 — Install Docker

```
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
docker version
```

## Phase 5 — Free domain for HTTPS

Login needs HTTPS (secure cookies), so you need a domain, not just the IP.
1. **duckdns.org** → sign in → create a subdomain, e.g. `pdftool-mukesh`.
2. Set its IP to your EC2 **Public IP** → update.

## Phase 6 — Get the code and configure

```
sudo apt-get install -y git
git clone https://github.com/mukeshroyhub/pdf_tool.git
cd pdf_tool
nano Caddyfile        # replace pdftool.example.com with pdftool-mukesh.duckdns.org
cp .env.oracle.example .env
nano .env             # fill in the real values (see below)
```
Fill `.env` with the SAME values you use on Render:
- `WEB_URL` / `API_URL` → `https://pdftool-mukesh.duckdns.org` (both the same)
- `DATABASE_URL` → your Neon connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → `openssl rand -hex 32` (run twice)
- `S3_*` → your Supabase bucket values
- `BREVO_API_KEY`, `MAIL_FROM` → your Brevo key + verified sender
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` → your Google OAuth creds

## Phase 7 — Launch

```
docker compose -f docker-compose.oracle.yml up -d --build
```
First build takes ~10–20 min on 1 GB (that's why swap matters). Watch it:
```
docker compose -f docker-compose.oracle.yml logs -f
```
Look for the API "listening … (production)" line and Caddy getting a certificate.

## Phase 8 — Point Google OAuth at the new domain

Google Cloud → Clients → your OAuth client → **Authorized redirect URIs** →
add `https://pdftool-mukesh.duckdns.org/api/auth/google/callback` → Save. Also
add the domain to Authorized JavaScript origins.

## Phase 9 — Verify

Open `https://pdftool-mukesh.duckdns.org`, sign in, upload a PDF, try a tool.

## Phase 10 — Retire Render

Once happy, suspend/delete the Render `pdftool-api` and `pdftool-web` services.
Keep Neon and Supabase — the EC2 box uses them.

---

## Troubleshooting

- **Site won't load** → Security Group missing port 80/443, or DuckDNS not
  pointing at the instance IP.
- **Build killed / OOM** → swap wasn't added (Phase 3). Add it and rebuild.
- **Cert error** → Caddy needs 80 + 443 open and the domain pointing at the box;
  check `docker compose -f docker-compose.oracle.yml logs caddy`.
- **Login doesn't persist** → you're on http not https, or WEB_URL/API_URL in
  `.env` aren't the https domain.
- **redirect_uri_mismatch on Google** → Phase 8 URL must match exactly.
