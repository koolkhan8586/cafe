# Deploying Cafe LSAF to cafe.khanmusa.com

A runbook for putting the app on a Ubuntu/Debian VPS behind nginx with a
Let's Encrypt certificate. Assumes the repo is at `/var/www/cafe`.

**Docker is not required.** The cafe app runs as a normal Node.js process under
systemd (`cafe-lsaf`). nginx reverse-proxies to `127.0.0.1:3003`. Docker is
only mentioned later as an *optional* way to run WAHA (WhatsApp); you can skip
that entirely.

Layout when you are done:

```
browser ──https──> nginx :443 ──http──> app 127.0.0.1:3003  (systemd, not Docker)
                                          └─ SQLite /var/lib/cafe-lsaf/cafe.db
                                          └─ WAHA  127.0.0.1:3001 (optional)
```

The nginx site file does **not** appear under `/etc/nginx/sites-available`
until you copy it from the repo (or run `install.sh` / `fix-nginx.sh`). Other
sites in that directory are unrelated; `cafe.khanmusa.com` must be added.

---

## Fast path (recommended, no Docker)

Point DNS at the server first (step 1 below), install Node 22+, clone the
repo, then let the installer do the rest — service user, `.env`, migrate,
seed, build, systemd, nginx, certbot, and firewall:

```bash
# On the VPS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo mkdir -p /var/www
sudo git clone <your-repo-url> /var/www/cafe
cd /var/www/cafe
sudo ./deploy/install.sh
```

That puts the site on **https://cafe.khanmusa.com**. Then change the seeded
PINs (step 9) and optionally start WAHA (step 7) if you want WhatsApp alerts.

Useful flags:

| Flag | When |
|---|---|
| `--skip-certbot` | DNS is not ready yet; you will run certbot later |
| `--cloudflare` | Orange-cloud proxy; origin cert already on disk (see appendix) |
| `--skip-seed` | Reinstall over an existing database |
| `--domain other.example.com` | Different hostname (rewrites the nginx `server_name`) |

### If nginx is already installed but cafe.khanmusa.com is missing

You already have other sites in `/etc/nginx/sites-available` — that is fine.
Copy the cafe files from the repo (still no Docker):

```bash
cd /var/www/cafe   # clone the repo here first if needed
sudo git pull

# 1) Shared proxy snippet → app on port 3003
sudo cp deploy/nginx/cafe-proxy.conf /etc/nginx/snippets/

# 2) Site config → sites-available (this is the missing file)
sudo cp deploy/nginx/cafe.khanmusa.com.conf /etc/nginx/sites-available/

# 3) Enable it
sudo ln -sfn /etc/nginx/sites-available/cafe.khanmusa.com.conf \
             /etc/nginx/sites-enabled/cafe.khanmusa.com.conf

sudo nginx -t && sudo systemctl reload nginx
ls /etc/nginx/sites-available/cafe.khanmusa.com.conf   # should exist now
```

Or in one step: `sudo ./deploy/fix-nginx.sh`

Then make sure the Node app is running via systemd (not Docker):

```bash
curl -I http://127.0.0.1:3003/login    # expect 200
# if that fails, finish the app install:
sudo ./deploy/install.sh --skip-certbot
# or only restart if already installed:
sudo systemctl restart cafe-lsaf
```

The sections below are the same steps, expanded, if you prefer to run them
by hand or need to diagnose a half-finished install.

---

## 0. Prerequisites

**Node 22+.** Prisma 7 and better-sqlite3 both require it.

```bash
node -v                       # must be v22 or newer
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

If you are upgrading Node on a box where you already ran `npm install`, the
native modules must be rebuilt:

```bash
cd /var/www/cafe && rm -rf node_modules package-lock.json && npm install
```

---

## 1. Point the domain at the server

An **A record** for `cafe.khanmusa.com` must resolve to the server's public
IPv4 address, **DNS-only** (grey cloud in Cloudflare, not proxied).

```bash
curl -4 ifconfig.me          # the address the A record should hold
dig +short cafe.khanmusa.com # must return exactly that address
```

If `dig` returns something in `188.114.x.x`, `104.x.x.x` or an IPv6 starting
`2606:4700:`, the record is **proxied through Cloudflare** and points at their
edge, not at you. Certbot's HTTP-01 challenge then lands on Cloudflare instead
of your nginx and fails. Either switch that record to DNS-only, or follow
[the Cloudflare appendix](#appendix-running-behind-the-cloudflare-proxy) instead
of step 6.

Note that the apex `khanmusa.com` being proxied does not matter — only the
record for this subdomain does.

---

## 2. Create a service user and the database directory

Running the app as its own user means a compromise of nginx (which runs as
`www-data`) does not hand over write access to the cafe's database.

```bash
sudo useradd --system --home /var/www/cafe --shell /usr/sbin/nologin cafe
sudo mkdir -p /var/lib/cafe-lsaf
sudo chown -R cafe:cafe /var/lib/cafe-lsaf /var/www/cafe
```

The database lives at `/var/lib/cafe-lsaf/cafe.db`, outside the git working
tree, so re-cloning or resetting the repo cannot destroy the cafe's orders.

---

## 3. Configure the app

```bash
cd /var/www/cafe
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Edit `.env`:

```ini
DATABASE_URL="file:/var/lib/cafe-lsaf/cafe.db"
SESSION_SECRET="<the hex string you just generated>"
CAFE_NAME="Cafe LSAF"
CURRENCY_SYMBOL="Rs"

WAHA_BASE_URL="http://127.0.0.1:3001"
WAHA_API_KEY="<a long random string, also given to WAHA below>"
WAHA_SESSION="default"
ADMIN_WHATSAPP_CHAT_ID=""
NOTIFY_EMPLOYEE_ON_STATUS="false"
```

`.env` is read by systemd as well as the app. systemd does not run a shell over
it: `KEY=value` and `KEY="value"` are fine, but `export`, backticks and
`${OTHER_VAR}` are not.

Lock it down and build:

```bash
sudo chown cafe:cafe .env && sudo chmod 600 .env
sudo -u cafe npm ci
sudo -u cafe npx prisma migrate deploy
sudo -u cafe npx tsx prisma/seed.ts
sudo -u cafe npm run build
```

---

## 4. Run it as a service

First make sure nothing already holds port 3003 — if you ran `npm run start`
while setting up, it is still listening and the service will fail to start with
`EADDRINUSE`:

```bash
sudo ss -ltnp | grep :3003     # expect no output
sudo pkill -f "next start"     # only if the above showed a leftover process
```

```bash
sudo cp deploy/systemd/cafe-lsaf.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cafe-lsaf
systemctl status cafe-lsaf
curl -I http://127.0.0.1:3003/login      # expect 200
```

The unit binds the app to `127.0.0.1` only, so it is unreachable from the
internet except through nginx.

Logs: `sudo journalctl -u cafe-lsaf -f`

---

## 5. Put nginx in front

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx/cafe-proxy.conf         /etc/nginx/snippets/
sudo cp deploy/nginx/cafe.khanmusa.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/cafe.khanmusa.com.conf /etc/nginx/sites-enabled/
# (Use cafe.khanmusa.com.cloudflare.conf instead only if the record is proxied —
#  see the appendix. Never enable both site files at once.)
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` complains about `Address family not supported by protocol`, the
server has no IPv6 — the `listen [::]:80` line in the site config is already
commented out for that reason, so check you have not uncommented it.

At this point `http://cafe.khanmusa.com` should load. **Do not sign in yet** —
see the warning in step 6.

---

## 6. Get the certificate

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cafe.khanmusa.com
```

Certbot edits the site config in place, adding the TLS block and an
http → https redirect, then reloads nginx. Renewal is automatic via the
`certbot.timer` systemd unit; check it with `systemctl list-timers | grep certbot`.

> **TLS is not optional here.** The session cookie is issued with the `Secure`
> flag in production, and browsers refuse to store a `Secure` cookie received
> over plain HTTP. If you try to sign in over `http://` the login POST succeeds
> and then nothing happens — you land back on the login page with no error.
> That symptom means the certificate is not in place yet, not that your password
> is wrong.

Verify:

```bash
curl -I https://cafe.khanmusa.com/login          # expect 200
curl -I http://cafe.khanmusa.com/login           # expect 301 to https
```

---

## 7. WAHA (WhatsApp)

Run WAHA bound to loopback so its dashboard is **not** exposed publicly — it
controls a paired WhatsApp account, and anyone who reaches it can send messages
as the cafe.

```bash
docker run -d --name waha --restart unless-stopped \
  -p 127.0.0.1:3001:3000 \
  -e WHATSAPP_API_KEY='<the same key you put in .env>' \
  -e WHATSAPP_RESTART_ALL_SESSIONS=True \
  -v waha-sessions:/app/.sessions \
  devlikeapro/waha
```

To pair the phone you need the dashboard, which is only on loopback. Tunnel to
it from your laptop rather than opening the port:

```bash
ssh -L 3001:127.0.0.1:3001 root@<server-ip>
# then open http://localhost:3001/dashboard, start the "default"
# session and scan the QR code
```

Then in the app: sign in as admin → **WhatsApp** → set *Where order alerts go*
(a number in international format with no `+`, or a group chat id ending
`@g.us`) → **Test connection** → **Send test message**.

---

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Ports 3003 and 3001 must **not** appear as public listeners. Both are bound to
loopback already; ufw is the second layer.

---

## 9. Lock the seeded accounts

The seed creates `ADMIN/admin1234`, `MANAGER/manager1234` and employees with PIN
`1234`. The site is now public. Sign in as admin → **Staff** → **Reset PIN** and
change every one of them before telling anyone the URL.

---

## Updating

```bash
sudo /var/www/cafe/deploy/deploy.sh
```

Pulls, installs, migrates, builds, and restarts — and leaves the old version
serving if the build fails.

## Backups

The whole database is one file. A nightly copy is enough:

```bash
sudo crontab -e
# 0 2 * * * sqlite3 /var/lib/cafe-lsaf/cafe.db ".backup '/var/backups/cafe-$(date +\%F).db'"
```

Use `.backup` rather than `cp` — it is safe while the app is writing.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| **`404 Not Found nginx/… (Ubuntu)`** | The cafe reverse-proxy site is **not enabled**. nginx is answering with its own default page, not the app. A down app would be **502**, not 404. Fix: `sudo /var/www/cafe/deploy/fix-nginx.sh` (or finish `install.sh`). |
| **`status=226/NAMESPACE` in `systemctl status cafe-lsaf`** | systemd sandbox setup failed — usually the app was never built (no `.next` directory) while the old unit listed only `.next` in `ReadWritePaths`, or `ProtectHome` blocked the app tree. Fix: `sudo -u cafe npm run build`, `sudo cp deploy/systemd/cafe-lsaf.service /etc/systemd/system/`, `sudo systemctl daemon-reload && sudo systemctl restart cafe-lsaf`. |
| Login POST returns 200 but you stay logged out | No HTTPS yet — the `Secure` cookie is being dropped. Finish step 6. |
| 502 Bad Gateway | App is not running. `systemctl status cafe-lsaf`, `journalctl -u cafe-lsaf -n 50`. |
| `EADDRINUSE: address already in use 127.0.0.1:3003` | Something else holds the port — usually a leftover `next start`. `sudo ss -ltnp \| grep :3003`, stop it, then `sudo systemctl restart cafe-lsaf`. |
| `systemctl status` says "active (running)" but the site is down | The service is restart-looping: you are seeing the newest attempt. `journalctl -u cafe-lsaf -n 50` shows the real error. The unit gives up after 5 failures in 2 minutes and settles into `failed`. |
| `datasource.url property is required` | `DATABASE_URL` unset. Check `.env` and that systemd is reading it. |
| Service dies at boot with a `SESSION_SECRET` error | Set `SESSION_SECRET` in `.env`; production refuses to start without it. |
| WhatsApp alerts logged as `skipped` | `WAHA_BASE_URL` or the recipient is blank. Admin → WhatsApp. |
| WhatsApp alerts logged as `failed` | WAHA unreachable, wrong API key, or the session is unpaired. Check the error text in the notification log. |
| Native module error after a Node upgrade | `rm -rf node_modules package-lock.json && npm install`. |

### Quick repair for the nginx 404

On the VPS (DNS already points here):

```bash
cd /var/www/cafe   # clone first if missing
sudo git pull
sudo ./deploy/fix-nginx.sh
# If that reports the app is down:
sudo ./deploy/install.sh --skip-certbot   # first-time app+nginx
# or, if the app was already installed:
sudo systemctl restart cafe-lsaf
sudo certbot --nginx -d cafe.khanmusa.com
```

Verify locally on the server:

```bash
curl -I http://127.0.0.1:3003/login              # app — expect 200
curl -I -H 'Host: cafe.khanmusa.com' http://127.0.0.1/login  # nginx — expect 200/301
```


---

## Appendix: running behind the Cloudflare proxy

Only needed if the DNS record for `cafe.khanmusa.com` is **proxied** (orange
cloud). With a DNS-only record, step 6 above is all you need.

When proxied, browsers see Cloudflare's certificate and Cloudflare talks to your
origin separately. Certbot's HTTP-01 challenge no longer reaches you, so the
origin gets a **Cloudflare Origin Certificate** instead — free, valid 15 years,
no renewal. It is trusted by Cloudflare only, which is all that matters because
nothing else should be talking to your origin.

### 1. Issue the origin certificate

Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**. Accept
the defaults, add `cafe.khanmusa.com`, and save the two blocks it shows you:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/cafe.khanmusa.com.pem   # the certificate
sudo nano /etc/ssl/cloudflare/cafe.khanmusa.com.key   # the private key
sudo chmod 600 /etc/ssl/cloudflare/cafe.khanmusa.com.key
sudo chown root:root /etc/ssl/cloudflare/*
```

Then set **SSL/TLS → Overview → Full (strict)**. Not "Flexible": that leaves the
Cloudflare-to-origin leg unencrypted, which puts session cookies in the clear.

### 2. Restore real visitor IPs

Without this every access-log line shows a Cloudflare address instead of the
visitor.

```bash
sudo /var/www/cafe/deploy/cloudflare/update-cloudflare-ips.sh
```

Cloudflare adds ranges occasionally, so refresh it monthly:

```bash
sudo crontab -e
# 0 4 1 * * /var/www/cafe/deploy/cloudflare/update-cloudflare-ips.sh >/dev/null
```

The ranges are fetched live and never hardcoded in this repo — a stale list
would silently break IP logging.

### 3. Swap the site config

```bash
sudo rm /etc/nginx/sites-enabled/cafe.khanmusa.com.conf
sudo cp deploy/nginx/cafe.khanmusa.com.cloudflare.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/cafe.khanmusa.com.cloudflare.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Lock the origin to Cloudflare (recommended)

Otherwise anyone who discovers `157.173.104.88` can bypass Cloudflare entirely
by sending a `Host: cafe.khanmusa.com` header. Turn on **SSL/TLS → Origin Server
→ Authenticated Origin Pulls** in the dashboard, then:

```bash
sudo curl -fsS -o /etc/ssl/cloudflare/origin-pull-ca.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

and uncomment the two `ssl_client_certificate` / `ssl_verify_client` lines in
the site config, then `sudo nginx -t && sudo systemctl reload nginx`.

Cloudflare then presents a client certificate on every request and nginx rejects
anything that cannot produce one — verified here: a request without the
certificate is refused at the TLS layer (400), a request with it gets through.

> **Do not** try to lock the origin down with an nginx `allow`/`deny` list of
> Cloudflare ranges. nginx evaluates those against `$remote_addr` *after* the
> realip module has rewritten it to the visitor's IP, so a Cloudflare-only
> allow-list rejects every genuine visitor and takes the whole site down. This
> was tested: a simulated visitor arriving through Cloudflare got a 403.
> Authenticated Origin Pulls is the mechanism that actually works. A firewall
> rule restricting ports 80/443 to Cloudflare ranges also works, because it acts
> at the TCP layer before nginx sees the request.

### If you switch a working site to proxied later

The Let's Encrypt certificate keeps working under Full (strict) until it expires,
but **renewal will fail**, because certbot's HTTP-01 challenge no longer reaches
your server. Either move to an origin certificate as above, or switch certbot to
the DNS-01 challenge with a Cloudflare API token.
