# Deploying PDF Tool to an Oracle Cloud Always Free VM

This moves your app off Render's sleepy free tier onto a free, always-on Linux
server with far more RAM (2 CPU / 12 GB) — which also fixes the OCR out-of-memory
crashes. Your **database stays on Neon** and **files stay on Supabase**, so this
VM holds no data and can be rebuilt any time.

Estimated time: about 60–90 minutes the first time. Go phase by phase.

---

## What you'll end up with

Browser → **Caddy** (HTTPS, port 443) → Next.js web app + Express API, all in
Docker on one VM. Same single-origin design as before, but no sleep and no 502s.

You need three files from this repo (already created for you):
- `docker-compose.oracle.yml`
- `Caddyfile`
- `.env.oracle.example`

---

## Phase 1 — Create the Oracle Cloud account

1. Go to **cloud.oracle.com** → **Start for free**.
2. Sign up. A credit/debit card is required **for identity verification only** —
   Always Free resources are never charged. Choose your **Home Region** carefully
   (pick one close to you; ARM capacity varies by region). You cannot change it later.
3. Finish signup and land in the OCI Console.

> If you truly have no card, Oracle won't work — tell me and we'll switch to the
> cheap-VPS path (Hetzner) instead.

## Phase 2 — Create the Always Free ARM VM

1. Console → hamburger menu → **Compute** → **Instances** → **Create instance**.
2. Name: `pdftool`.
3. **Image and shape** → **Edit**:
   - Image: **Canonical Ubuntu 22.04**.
   - Shape → **Ampere** → **VM.Standard.A1.Flex** → set **2 OCPUs** and **12 GB**
     memory (the current Always Free limit).
   - If you see **"Out of capacity"**, try again later or pick another
     Availability Domain — ARM capacity is in high demand.
4. **Networking**: keep the default VCN; make sure **"Assign a public IPv4 address"**
   is **Yes**.
5. **Add SSH keys**: choose **Generate a key pair for me** → **Download both** the
   private and public keys. Keep the private key safe — you log in with it.
6. **Create**. Wait until the instance shows **Running**, then copy its
   **Public IP address**.

## Phase 3 — Open the firewall (two places — both required)

Oracle blocks ports at the network level AND inside Ubuntu.

**A) Network (VCN security list):**
1. On the instance page → click the **Virtual Cloud Network** link → **Security Lists**
   → **Default Security List**.
2. **Add Ingress Rules** — add two:
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**.
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**.

**B) Inside Ubuntu (do this after Phase 4 once you're logged in):**
```
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## Phase 4 — Connect to the VM

On your Windows PC, open PowerShell where you saved the private key:
```
ssh -i path\to\your-private-key ubuntu@YOUR_PUBLIC_IP
```
(Type `yes` if asked to trust the host.) You're now on the server. Run the
Phase 3B iptables commands now.

## Phase 5 — Install Docker

```
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker           # apply the group without logging out
docker version          # should print client + server
```

## Phase 6 — Point a free domain at the VM (needed for HTTPS)

Login uses secure cookies, which require HTTPS — so you need a domain name, not
just the IP. A free DuckDNS subdomain works perfectly.

1. Go to **duckdns.org** → sign in with Google/GitHub.
2. Create a subdomain, e.g. `pdftool-mukesh` → it becomes
   `pdftool-mukesh.duckdns.org`.
3. Set its **current IP** to your VM's **Public IP** → **update**.

## Phase 7 — Get the code and configure it

On the VM:
```
sudo apt-get install -y git
git clone https://github.com/mukeshroyhub/pdf_tool.git
cd pdf_tool
```

**Edit the Caddyfile** — replace the example domain with yours:
```
nano Caddyfile
```
Change `pdftool.example.com` to `pdftool-mukesh.duckdns.org`. Save with
`Ctrl+O`, Enter, then `Ctrl+X`.

**Create the .env** from the template:
```
cp .env.oracle.example .env
nano .env
```
Fill in:
- `WEB_URL` and `API_URL` → `https://pdftool-mukesh.duckdns.org` (your domain).
- `DATABASE_URL` → your Neon connection string (Neon console → Connect).
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → generate each with
  `openssl rand -hex 32` (run it twice, paste the outputs).
- `S3_*` → your Supabase bucket values (endpoint/region are already filled;
  add your Access Key ID and Secret).

Save and exit.

## Phase 8 — Launch

```
docker compose -f docker-compose.oracle.yml up -d --build
```
The first build takes ~10–20 minutes (it installs LibreOffice + Tesseract).
Watch progress / check for errors:
```
docker compose -f docker-compose.oracle.yml logs -f
```
Look for the API line **"PDF Tool API listening ... (production)"** and Caddy
obtaining a certificate for your domain. Press `Ctrl+C` to stop watching (the
containers keep running).

## Phase 9 — Verify

Open **https://pdftool-mukesh.duckdns.org** in your browser. You should get the
login page over HTTPS (padlock icon). Sign in — because it uses the same Neon
database, your existing account works. Upload a file and try OCR: with 12 GB RAM
it now completes instead of crashing.

## Phase 10 — Keep it healthy

- **Auto-restart:** already set (`restart: unless-stopped`) — containers come
  back after a reboot.
- **Don't stop the instance** in the OCI console; Oracle may reclaim idle
  *stopped* Always Free VMs. A running instance is fine.
- **Update the app later:**
  ```
  cd ~/pdf_tool && git pull
  docker compose -f docker-compose.oracle.yml up -d --build
  ```
- **DuckDNS IP:** Oracle public IPs are stable while the instance exists, so you
  normally won't need to update DuckDNS again.

## Phase 11 — Retire Render (after the VM works)

Once you're happy with the VM, you can suspend/delete the Render `pdftool-api`
and `pdftool-web` services. Keep Neon and Supabase — the VM uses them.

---

## Troubleshooting

- **Site won't load / times out** → a firewall step was missed. Re-check Phase 3
  (both the VCN ingress rules AND the iptables commands).
- **"connection not secure" / cert error** → Caddy couldn't get a certificate.
  It needs ports 80 and 443 open and the domain pointing at the VM. Check
  `docker compose -f docker-compose.oracle.yml logs caddy`.
- **Login doesn't persist** → you're on `http://` not `https://`, or WEB_URL/
  API_URL in `.env` aren't your https domain.
- **API keeps restarting** → `docker compose ... logs api`. Most likely a wrong
  `DATABASE_URL` or a missing `S3_*` value.
- **Build fails on an ARM package** → rare; send me the log line and I'll adjust.
