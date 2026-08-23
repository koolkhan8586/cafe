# Cafe LSAF

Internal cafe ordering for LSAF. Employees browse the menu and send an order to
the counter, the cafe admin gets it on WhatsApp within a second or two and works
it through a live board, and the cafe manager sees what it all costs and earns.

Built with Next.js 16 (App Router), Prisma 7 on SQLite, and
[WAHA](https://waha.devlike.pro) for the WhatsApp side.

---

## What each role gets

**Employee** — signs in with an employee ID and a PIN, browses the menu by
category, builds a cart with per-item notes ("no sugar"), adds a note for the
counter ("2nd floor meeting room"), and follows their order's status. `My orders`
also totals what they have spent.

**Cafe admin** — a live counter board with New / Preparing / Ready columns that
refreshes itself every ten seconds. Moves each order along, cancels when needed,
and manages the menu (including each item's cost price), the staff list and PIN
resets, and the WhatsApp connection. Every WhatsApp attempt is logged with its
outcome.

**Cafe manager** — revenue, profit, order count and average order over any date
range; revenue and profit per day as a chart; top sellers; revenue by department
and by employee. A separate Costs & margin page gives per-item price, cost,
profit per unit, margin %, and what each item actually sold and earned in the
period. Both pages export to CSV.

---

## Quick start

**Requires Node 22 or newer.** Prisma 7 and better-sqlite3 both need it, and npm
only *warns* about the mismatch — an install on Node 20 looks like it worked and
then fails later. Check with `node -v`; if you are below 22:

```bash
# Debian / Ubuntu
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# or with nvm
nvm install 22 && nvm use 22
```

Then:

```bash
npm install
npm run setup      # migrate + generate + seed
npm run dev        # http://localhost:3000
```

That works with no configuration — it creates `dev.db` in the project root and
seeds it. **Before putting it in front of anyone**, add a `.env`:

```bash
cp .env.example .env
# Set SESSION_SECRET — the app refuses to start in production without it:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you switch Node versions after installing, rebuild the native modules:
`rm -rf node_modules package-lock.json && npm install`.

Seeded sign-ins — **change these before anyone else can reach the app**:

| Role     | Employee ID | PIN / password |
|----------|-------------|----------------|
| Admin    | `ADMIN`     | `admin1234`    |
| Manager  | `MANAGER`   | `manager1234`  |
| Employee | `LSAF-001`  | `1234`         |

Employees `LSAF-002` … `LSAF-005` are also seeded with PIN `1234`.

Want the reports to have something in them? `npm run db:demo` generates about a
month of plausible past orders. Never run it against real cafe data.

---

## Connecting WhatsApp (WAHA)

WAHA is a self-hosted HTTP API in front of WhatsApp. The app only uses two of
its endpoints: `GET /api/sessions/{session}` to check the pairing, and
`POST /api/sendText` to send a message.

1. **Run WAHA.** Either use the bundled compose file (below), or on its own:

   ```bash
   docker run -it --rm -p 3001:3000 \
     -e WHATSAPP_API_KEY=pick-a-long-random-key \
     -v waha-sessions:/app/.sessions \
     devlikeapro/waha
   ```

2. **Pair the phone.** Open `http://localhost:3001/dashboard`, start the
   `default` session, and scan the QR code with the WhatsApp account the cafe
   should send from. Keep the volume mounted or you will rescan on every restart.

3. **Point the app at it.** Either fill in the `WAHA_*` variables in `.env`, or
   sign in as admin and use **WhatsApp** in the nav. Settings saved in the UI
   override the environment variables, so a deployment can run on env alone and
   the screen stays optional.

4. **Set the recipient.** `ADMIN_WHATSAPP_CHAT_ID` is where new-order alerts go.
   Use a phone number in international format with no `+` (`923001234567`), or a
   full chat id — `923001234567@c.us` for a person, `...@g.us` for a group. A
   group is usually the right answer so the whole counter team sees orders.

5. **Check it.** The settings page has **Test connection** (asks WAHA whether the
   session is paired) and **Send test message** (actually delivers one). The
   Recent notifications panel next to it shows every attempt with its result.

Optionally tick *"Also message the employee when their order changes status"* —
that needs a WhatsApp number on the employee's staff record.

### If WhatsApp is down

Orders are never lost to a WhatsApp problem. The send is best-effort: the order
is written to the database first, then the message is attempted, and the failure
is recorded in the notification log and shown to the employee ("Saved — but the
WhatsApp alert did not go out"). The counter board is the source of truth;
WhatsApp is the nudge.

---

## Deploying to a domain

For a real deployment behind a domain — nginx, TLS, a systemd service, WAHA on
loopback, firewall and backups — follow **[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md)**.
It is written against `cafe.khanmusa.com` on a Ubuntu VPS; change the hostname
and the rest applies.

One thing to know before you start: **TLS is not optional.** The session cookie
is issued with the `Secure` flag in production and browsers will not store it
over plain HTTP, so signing in appears to silently fail until the certificate is
in place.

Update an existing deployment with `sudo /var/www/cafe/deploy/deploy.sh`.

## Running with Docker

```bash
cp .env.example .env      # set SESSION_SECRET and WAHA_API_KEY
docker compose up -d
```

That brings up the app on `http://localhost:3000` and WAHA on
`http://localhost:3001`. Migrations run and the baseline data is seeded on
first boot; set `SEED_ON_START=false` once the cafe has real data.

---

## How the money works

Every amount is stored as an **integer number of minor units** (paisa), never as
a float — `src/lib/money.ts` has the parse and format helpers. Floats drift, and
a daily total that is off by a rupee is worse than useless.

Each order line **snapshots** the item's name, selling price and cost price at
the moment it is placed. Re-pricing a coffee tomorrow therefore cannot rewrite
last month's revenue or profit. It also means removing an item that has ever been
ordered hides it from the menu rather than deleting it, so the history survives.

**Cancelled orders are excluded** from every revenue, cost and profit figure.
They are counted separately on the sales page so a spike in cancellations is
visible rather than silently missing.

An item with no cost price shows a 100% margin, which is misleading — the Costs
& margin page calls out any item in that state so the admin can fill it in.

---

## Project layout

```
prisma/schema.prisma        Data model; money is Int minor units
prisma/seed.ts              Baseline menu and accounts
prisma/demo-orders.ts       Optional sample history for the reports
src/lib/waha.ts             WAHA client + the message templates
src/lib/reports.ts          All sales and cost aggregation
src/lib/money.ts            Money parsing, formatting, margin
src/lib/session.ts          HMAC-signed httpOnly session cookie
src/lib/auth.ts             bcrypt, login, role guards for pages
src/lib/api-auth.ts         Role guards for API routes
src/app/(app)/             Signed-in pages, grouped by role
src/app/api/                Route handlers
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run setup` | Migrate, generate the client, seed |
| `npm run db:migrate` | Create and apply a migration after a schema change |
| `npm run db:seed` | Seed baseline data (safe to re-run) |
| `npm run db:demo` | Generate ~30 days of sample orders |
| `npm run db:studio` | Browse the database |
| `npm run lint` | ESLint |

---

## Security notes

- PINs and passwords are bcrypt hashed. Employees need 4+ digits, admins and
  managers 8+ characters. The login response never says which half was wrong,
  and an unknown employee ID still runs a bcrypt comparison so timing does not
  leak who exists.
- Sessions are HMAC-signed httpOnly cookies, valid for 12 hours.
  **`SESSION_SECRET` is required in production** — the server refuses to start
  without one rather than silently signing cookies with a known key. A shared
  dev fallback applies only outside production.
- Prices and costs are always read from the database when an order is placed.
  A tampered request cannot set its own price.
- Order status follows a one-way workflow, so a completed or cancelled order
  cannot be reopened and past revenue cannot be quietly rewritten.
- The WAHA API key is never sent back to the browser; the settings screen only
  reports whether one is set.
- People and menu items are deactivated rather than deleted once they appear in
  the order history.

### Switching from SQLite to Postgres

Change `provider` in `prisma/schema.prisma` to `postgresql`, swap the driver
adapter in `src/lib/prisma.ts` for `@prisma/adapter-pg` (with `pg` installed),
point `DATABASE_URL` at the server and re-run the migrations. Nothing else in
the app depends on the database engine. Worth doing if more than a handful of
people order at once — SQLite locks the file on writes.

### Known advisory

`npm audit` reports a high-severity advisory in `deepmerge-ts`, reached only
through the Prisma **CLI's** config loader (`prisma` is a devDependency). It is
not in the running application's dependency path. Fixing it via `npm audit fix
--force` downgrades Prisma to 6.x, which this project's schema and client setup
do not target. Revisit when Prisma ships an updated `@prisma/config`.
