# Deploying Cafe LSAF to cafe.khanammad.com

A runbook for putting the app on a Ubuntu/Debian VPS behind nginx with a
Let's Encrypt certificate. Assumes the repo is at `/var/www/cafe`.

Layout when you are done:

```
browser ──https──> nginx :443 ──http──> app 127.0.0.1:3000
                                          └─ SQLite /var/lib/cafe-lsaf/cafe.db
                                          └─ WAHA  127.0.0.1:3001 (not public)
```

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

Create an **A record** for `cafe.khanammad.com` pointing at the server's public
IPv4 address. Add an **AAAA record** as well only if the server has IPv6.

```bash
curl -4 ifconfig.me          # the address the A record should hold
dig +short cafe.khanammad.com
```

Wait until `dig` returns your server's IP before running certbot — the
certificate check fails otherwise. Propagation is usually minutes, but the TTL
on an existing record can make it longer.

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

```bash
sudo cp deploy/systemd/cafe-lsaf.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cafe-lsaf
systemctl status cafe-lsaf
curl -I http://127.0.0.1:3000/login      # expect 200
```

The unit binds the app to `127.0.0.1` only, so it is unreachable from the
internet except through nginx.

Logs: `sudo journalctl -u cafe-lsaf -f`

---

## 5. Put nginx in front

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx/cafe-proxy.conf         /etc/nginx/snippets/
sudo cp deploy/nginx/cafe.khanammad.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/cafe.khanammad.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` complains about `Address family not supported by protocol`, the
server has no IPv6 — the `listen [::]:80` line in the site config is already
commented out for that reason, so check you have not uncommented it.

At this point `http://cafe.khanammad.com` should load. **Do not sign in yet** —
see the warning in step 6.

---

## 6. Get the certificate

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cafe.khanammad.com
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
curl -I https://cafe.khanammad.com/login          # expect 200
curl -I http://cafe.khanammad.com/login           # expect 301 to https
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

Ports 3000 and 3001 must **not** appear. Both are bound to loopback already;
ufw is the second layer.

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
| Login POST returns 200 but you stay logged out | No HTTPS yet — the `Secure` cookie is being dropped. Finish step 6. |
| 502 Bad Gateway | App is not running. `systemctl status cafe-lsaf`, `journalctl -u cafe-lsaf -n 50`. |
| `datasource.url property is required` | `DATABASE_URL` unset. Check `.env` and that systemd is reading it. |
| Service dies at boot with a `SESSION_SECRET` error | Set `SESSION_SECRET` in `.env`; production refuses to start without it. |
| WhatsApp alerts logged as `skipped` | `WAHA_BASE_URL` or the recipient is blank. Admin → WhatsApp. |
| WhatsApp alerts logged as `failed` | WAHA unreachable, wrong API key, or the session is unpaired. Check the error text in the notification log. |
| Native module error after a Node upgrade | `rm -rf node_modules package-lock.json && npm install`. |
