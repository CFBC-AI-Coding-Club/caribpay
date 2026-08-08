# CaribPay

CaribPay is a **payment switch for the Caribbean** — the messaging and clearing layer that sits between member banks, in the mould of India's UPI and Africa's PAPSS. It lets a person in one island send money to a person in another island in seconds, addressed by a human-readable address like `amara@caribpay`, a phone number, an email, or a signed QR code, across five currencies (XCD, JMD, BBD, TTD, USD). It is deliberately **not a wallet**: CaribPay never holds customer money at any point. Money stays at the member banks. CaribPay resolves an address to an account, instructs the two banks, and clears the resulting positions between them.

This repository is a Phase 2 prototype built for the **CANTO Innovation Challenge 2026**.

> **Every bank named in this project is simulated.** We have no relationship with St. Kitts-Nevis-Anguilla National Bank, NCB Jamaica, Republic Bank, Scotiabank, CIBC, or any other institution in the list. Nothing here connects to a real bank, and no real money moves.

---

## The problem, and our approach

Sending money between Caribbean islands today usually means routing it through a US-dollar correspondent bank. An EC$ payment from St. Kitts to Jamaica becomes two foreign-exchange hops — XCD to USD, USD to JMD — through an intermediary outside the region. That adds a spread on each hop, a fee, a settlement delay measured in days, and a dependency on a relationship no Caribbean institution controls. For the amounts people actually send between family and small businesses, the cost is a meaningful fraction of the transfer.

CaribPay's approach is an **overlay switch**: a thin regional layer above the banks that already hold the money. A transfer is a conversation with two banks — reserve at the payer's, credit at the payee's, then post the two banks' obligations to a clearing ledger — so an XCD→JMD payment is a single regional movement rather than two hops through the dollar. The credit to the payee is instant and irrevocable; settlement between the banks is deferred and netted, so one instruction per bank pair replaces every individual transfer in the window.

Because customer funds never touch us, CaribPay is a payment initiation and clearing operator rather than an e-money issuer: no float, no safeguarding account, and a materially lighter regulatory ask. That is the same structural reason NPCI could scale UPI without becoming a bank.

---

## Key features

- **Human-readable addresses.** Every account gets a neutral address at signup (`cp-a7k2m9x4@caribpay`) and can claim a memorable one (`amara@caribpay`). Addresses are checked for visual confusables, so `rn` cannot masquerade as `m`.
- **Send by address, contact, or signed QR.** QR payloads are `caribpay://pay?...` URIs signed with HMAC-SHA256; a tampered address, currency, or name fails verification.
- **Also addressable by phone or email**, verified before use.
- **Five currencies** — XCD, JMD, BBD, TTD, USD — with live FX quotes locked for 60 seconds.
- **Live balances**, read from the member bank on every request and cached nowhere.
- **Transaction history and receipts** that stay correct after someone changes their address.
- **An append-only, double-entry clearing ledger**, with per-currency reconciliation and a net-settlement engine.
- **Auth**: 15-minute JWT access tokens with rotating 30-day refresh tokens, argon2id password hashing, and reuse detection that revokes a whole token family.

---

## Architecture

A Bun workspaces monorepo:

| Path | What it is |
|---|---|
| `apps/api` | **The switch.** Directory, transfers saga, clearing ledger, netting, FX. Holds no customer money. |
| `apps/mock-bank` | **The member banks.** A separate service with its own database, where customer money actually lives. |
| `apps/mobile` | The Expo / React Native consumer app. |
| `packages/shared` | Zod schemas, currency maths, address logic — the single source of truth both services import. |

```mermaid
flowchart TD
    M["📱 Expo mobile app<br/>(TanStack Query)"]
    A["apps/api — THE SWITCH<br/>auth · directory · transfers saga<br/>clearing · netting · FX"]
    B["apps/mock-bank — MEMBER BANKS<br/>accounts · holds · debits · credits"]
    DB[("caribpay (Postgres)<br/>clearing ledger<br/>NO customer balances")]
    BDB[("caribpay_bank (Postgres)<br/>customer money lives here")]
    R[("Redis + BullMQ<br/>saga worker<br/>recovery sweeper")]

    M -- "HTTPS / JSON" --> A
    A -- "HTTP via BankConnector<br/>(the only route to customer money)" --> B
    A --- DB
    A --- R
    B --- BDB
```

The switch has **no credentials for `caribpay_bank`**. Direct SQL across that boundary is impossible, not merely discouraged — which is what makes "we hold no funds" a property a judge can inspect rather than a claim we make.

### The transfer lifecycle

```
initiated → debit_pending → debit_held → credit_pending → completed
                    ↘ failed                  ↘ reversal_pending → reversed
```

1. Resolve the address to a member bank and an account.
2. Ask the **payer's bank** for a hold. Refused → `failed`, nothing posted.
3. Ask the **payee's bank** to credit. Refused → release the hold → `reversed`.
4. Confirm the hold as a settled debit, then post the clearing entries and the recipient's notification **in one database transaction** → `completed`.

Two rules govern recovery. A **refusal** (the bank says it did not happen) is actionable; an **unknown** (timeout, 5xx, still in flight) is not — the switch re-sends the identical instruction rather than reversing, because a credit whose outcome is unknown may well have landed. And recovery always drives **forward**: past the credit, the money has irrevocably reached the payee. Idempotency keys sent to a bank are derived (`${transactionId}:${step}`), never generated, so a retry replays instead of repeating.

### The clearing ledger

Append-only — a Postgres trigger rejects `UPDATE` and `DELETE` on `ledger_entries`. Every entry is a system-account entry; there is no customer side, because there are no customer balances in this database. Positions are always derived from the entries, never stored as a mutable column.

**Invariant:** per transaction, per currency, `sum(debits) = sum(credits)`.

A cross-currency transfer (XCD → JMD) posts two legs that balance independently:

```
1.  DEBIT  payer_bank_position (XCD)   /  CREDIT  fx_liquidity (XCD)
2.  DEBIT  fx_liquidity (JMD)          /  CREDIT  payee_bank_position (JMD)
```

Same-currency posts a single leg directly between the two banks. Position sign convention is `credits − debits`; negative means that bank owes the network.

All money is stored and computed as **integer minor units** (cents). Never floats. `packages/shared/src/currency.ts` is the only place money arithmetic and formatting happen.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Bun 1.3+ |
| API framework | Hono 4 |
| ORM / migrations | Drizzle ORM 0.45 + drizzle-kit |
| Database | PostgreSQL 16 — **two databases**: `caribpay` (switch) and `caribpay_bank` (member banks) |
| Queue / cache | Redis 7 + BullMQ (`maxmemory-policy noeviction`) |
| Validation | Zod 4, in a shared package both services import |
| Mobile | Expo SDK 54, React Native 0.81, expo-router 6, TypeScript strict |
| Mobile data | TanStack Query (server state) + Zustand (client state) |
| Auth | JWT access (15 min) + rotating refresh (30 d), `Bun.password` argon2id |
| Local infra | Docker Compose (Postgres + Redis only; services run on the host via Bun) |

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Bun** | 1.3 or newer | Runtime, package manager, and test runner |
| **Node.js** | 20 or newer | Only needed for the Expo CLI (`npx expo`) |
| **Docker** + Compose | any current | Runs Postgres 16 and Redis 7 for you |
| **Expo Go** | latest | On your phone, to run the mobile app |

You do **not** need to install Postgres or Redis yourself — Docker Compose provides both.

**macOS**

```bash
curl -fsSL https://bun.sh/install | bash
brew install node
brew install --cask docker
```

**Linux (Debian / Ubuntu)**

```bash
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo apt-get install -y docker.io docker-compose-v2 && sudo usermod -aG docker "$USER"
```

**Windows (PowerShell)**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
```

Install **Expo Go** from the [App Store](https://apps.apple.com/app/expo-go/id982107779) or [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent).

---

## Setup

Run every command from the repository root unless told otherwise.

**1. Clone the repository**

```bash
git clone https://github.com/CFBC-AI-Coding-Club/caribpay.git && cd caribpay
```

**2. Install dependencies**

```bash
bun install
```

**3. Start Postgres and Redis**

```bash
docker compose up -d
```

This starts Postgres 16 on port 5432 and Redis 7 on port 6379, and creates all four databases (`caribpay`, `caribpay_bank`, plus two test databases) on first boot. Wait for both to report healthy:

```bash
docker compose ps
```

**4. Create the environment files**

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/mock-bank/.env.example apps/mock-bank/.env
```

Every value ships with a working local default, so you can run the demo without editing anything. What each variable does:

| Variable | File | Default | What it does |
|---|---|---|---|
| `REDIS_PORT` | `.env` | `6379` | Host port for the Redis container. Change it if 6379 is already taken, then match `REDIS_URL` below. |
| `PORT` | `apps/api/.env` | `3000` | Port the switch API listens on. |
| `DATABASE_URL` | `apps/api/.env` | `postgresql://caribpay:caribpay@localhost:5432/caribpay` | The switch database — directory, clearing ledger, positions. Never a customer balance. |
| `REDIS_URL` | `apps/api/.env` | `redis://localhost:6379` | BullMQ transfer queue and the 60-second FX quote cache. |
| `JWT_ACCESS_SECRET` | `apps/api/.env` | `change-me-access` | Signs access tokens. Fine for local use; generate a real one with `openssl rand -hex 32` for anything else. |
| `ACCESS_TOKEN_TTL_SECONDS` | `apps/api/.env` | `900` | Access-token lifetime (15 minutes). |
| `REFRESH_TOKEN_TTL_DAYS` | `apps/api/.env` | `30` | Refresh-token lifetime. |
| `QR_HMAC_SECRET` | `apps/api/.env` | `change-me-qr` | Signs `caribpay://` QR payloads. Must be identical across every process that mints or resolves a QR. |
| `BANK_BASE_URL` | `apps/api/.env` | `http://localhost:3100` | The member-bank service. The switch's only route to a customer account. |
| `BANK_TIMEOUT_MS` | `apps/api/.env` | `10000` | Past this, a bank's answer is *unknown* rather than failed, and the saga re-sends instead of reversing. |
| `WORKER_IN_PROCESS` | `apps/api/.env` | `true` | Runs the transfer worker inside the API process. Set `false` when running it separately. |
| `BANK_PORT` | `apps/mock-bank/.env` | `3100` | Port the member-bank service listens on. |
| `BANK_DATABASE_URL` | `apps/mock-bank/.env` | `postgresql://caribpay:caribpay@localhost:5432/caribpay_bank` | The bank database — where customer money lives. The switch has no credentials for it. |
| `MOCK_BANK_LATENCY_MIN_MS` | `apps/mock-bank/.env` | `300` | Lower bound on simulated bank processing time. |
| `MOCK_BANK_LATENCY_MAX_MS` | `apps/mock-bank/.env` | `1200` | Upper bound. Together these make a transfer take a realistic couple of seconds. |
| `MOCK_BANK_FAILURE_RATE` | `apps/mock-bank/.env` | `0` | Probability in `[0,1]` that a bank call fails. Leave at 0 for a demo; raise it to exercise recovery. |
| `MOCK_BANK_HOLD_TTL_SECONDS` | `apps/mock-bank/.env` | `300` | How long a hold survives unconfirmed before the bank releases it on its own. |

**5. Run the migrations**

```bash
bun run db:migrate
bun run db:migrate:bank
```

**6. Seed the demo data**

```bash
bun run db:seed:demo
bun run db:seed:bank
```

The first command seeds institutions, clearing accounts, FX rates, and four demo users. The second gives those users balances at their banks. If you have seeded before, add `--reset` to wipe and start clean:

```bash
bun run db:seed:demo --reset
```

**7. Start the member banks** (leave this terminal running)

```bash
bun run dev:bank
```

**8. Start the switch API** (a second terminal, also left running)

```bash
bun run dev:api
```

Confirm it is up:

```bash
curl http://localhost:3000/api/v1/health
```

```json
{"status":"ok","db":"up","redis":"up"}
```

**9. Start the mobile app** (a third terminal)

```bash
bun run dev:mobile
```

**10. Connect your phone**

This is the step that most often goes wrong, so it is worth being precise.

Your phone and your computer must be **on the same Wi-Fi network**. `localhost` on your phone means the phone itself, not your dev machine — so the app resolves your machine's **LAN IP** automatically from the address Expo is serving on, and points at port 3000 there. In most cases this simply works:

1. Expo prints a QR code in the terminal. Scan it with the **Camera app** (iOS) or the **Expo Go app** (Android).
2. The app opens in Expo Go and reaches the API at `http://<your-LAN-IP>:3000`.

If the app loads but every request fails, your machine's firewall is almost certainly blocking inbound connections on port 3000. Allow it:

```powershell
New-NetFirewallRule -DisplayName "CaribPay API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

```bash
sudo ufw allow 3000/tcp && sudo ufw allow 8081/tcp
```

To point the app somewhere else explicitly, set the API base URL before starting Expo — use your LAN IP, **never `localhost`**:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.5:3000 bun run dev:mobile
```

Find your LAN IP with `ipconfig` (Windows), `ipconfig getifaddr en0` (macOS), or `hostname -I` (Linux).

---

## Demo walkthrough

### Seeded demo accounts

All four use the password **`demo1234`**.

| Name | Login email | CaribPay address | Bank | Opening balance |
|---|---|---|---|---|
| Amara Liburd | `amara@caribpay.test` | `amara@caribpay` | St. Kitts-Nevis-Anguilla National Bank | **EC$5,000.00** (XCD) |
| Devon Campbell | `devon@caribpay.test` | `devon@caribpay` | National Commercial Bank Jamaica | **J$800,000.00** (JMD) |
| Shanice Braithwaite | `shanice@caribpay.test` | `shanice@caribpay` | Republic Bank (Barbados) | **Bds$4,000.00** (BBD) |
| Ravi Maharaj | `ravi@caribpay.test` | `ravi@caribpay` | Republic Bank (Trinidad) | **TT$10,000.00** (TTD) |

Two extra accounts exist at the banks so the failure branches can be shown deliberately rather than by luck: `NCB-ACCT-4009` is **closed** and `SKNANB-ACCT-4009` is **frozen**.

The demo reads best on two devices — Amara sending, Devon receiving — but a single device works if you log out and back in.

**1. Log in**

Open the app and sign in as `amara@caribpay.test` / `demo1234`.
*Expected:* the home screen, showing Amara's CaribPay address and her St. Kitts account.

Registering a new account instead also works: it mints a neutral address like `cp-a7k2m9x4@caribpay` immediately. Note that a new user **cannot receive money until they connect a bank account** — the app says so plainly, and that is honest behaviour rather than a bug.

**2. View the balance**

*Expected:* **EC$5,000.00**, labelled as held at St. Kitts-Nevis-Anguilla National Bank and read live. This figure is fetched from the bank on every load and cached nowhere; the switch has no balance column to read it from.

**3. Send money by address**

Tap **Send**, enter `devon@caribpay`.

*Expected:* the recipient resolves to **"Devon C."** — a *masked* name — at National Commercial Bank Jamaica, in JMD. The directory never returns an account reference or a user id, only enough to confirm you are paying the right person.

Confirm the recipient, then enter **500**. The screen quotes the conversion and locks it for 60 seconds.

*Expected:* roughly **EC$500.00 → J$29,259.26** at a rate of `58.51851852`.

Tap **Confirm & send**.

**4. Watch it settle**

*Expected:* a live status screen moving `Sent → Held at your bank → Settled`, reaching **completed in roughly 2–4 seconds**. That delay is real work, not a timer: the mock banks each take 300–1200 ms to answer, and a transfer makes three bank calls (hold, credit, confirm). Polling `GET /transfers/:id` shows it pass through `debit_pending` and `credit_pending` on the way.

On Devon's device, a notification arrives and the balance rises to **J$829,259.26**.

**5. Send via QR**

On Devon's device, open **Receive**. A QR code is shown beneath his address.

*Expected:* the payload is a signed URI of the form `caribpay://pay?vpa=devon%40caribpay&currency=JMD&name=Devon+C.&country=JM&sig=<40 hex chars>`. The signature is HMAC-SHA256 truncated to 160 bits and covers every field, so none can be swapped.

From Amara's device, tap **Scan** and point at it.

*Expected:* the same confirmation screen as typing the address. The QR is signed, but the **directory still gets the last word** on who that address currently reaches — a scanned code is never trusted to route money on its own.

**6. Prove the books balanced**

In the app, open **Menu → Settlement** to see what each bank now owes. Or from a terminal:

```bash
bun run reconcile
```

*Expected:* the two banks in the transfer have moved in equal and opposite directions, and every check passes.

```
Bank positions
  St. Kitts-Nevis-Anguilla National Bank owes           EC$500.00   cap EC$675,000.00
  National Commercial Bank Jamaica       is owed      J$29,259.26   cap J$39,500,000.00

reconcile clean: every currency nets to zero, no cap breached,
no transfer stalled, no hold stranded at any bank.
```

Then net those positions down:

```bash
bun run settle
```

*Expected:*

```
Cycle 2026-08-08 · St. Kitts-Nevis-Anguilla National Bank ↔ National Commercial Bank Jamaica
  1 transfer   gross EC$500.00
  NET: St. Kitts-Nevis-Anguilla National Bank owes the network         EC$500.00
  NET: National Commercial Bank Jamaica       is owed by network      J$29,259.26
  2 settlement instructions replace 1 correspondent hop.
```

That last line is the economic argument: with a thousand transfers in the window, it would still be two instructions.

**7. View history**

Open **Activity**.

*Expected:* the transfer, showing the leg that belongs to the viewer — Amara sees `−EC$500.00`, Devon sees `+J$29,259.26`. Tapping through gives a receipt with the timeline and the exact rate used, and it stays correct even if either person later changes their address.

### Optional: show that a retry cannot double-spend

Post the same transfer twice with the same idempotency key:

```bash
curl -s -X POST http://localhost:3000/api/v1/transfers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" \
  -d '{"toKey":"devon@caribpay","sourceAccountId":"<id>","sourceCurrency":"XCD","destCurrency":"JMD","sourceAmountMinor":50000}'
```

*Expected:* the second call returns the **identical transaction id** and the original response body, replayed. No second transfer, no second hold. The key is claimed by an `INSERT` before the handler runs, so concurrent retries serialise on the primary key rather than racing.

---

## Testing

```bash
bun test
```

*Expected:* **145 tests pass across 9 files**, in around 25 seconds. The suite needs Postgres and Redis running (step 3 above); it uses the separate `caribpay_test` and `caribpay_bank_test` databases and never touches your demo data.

What it covers:

| Area | What is asserted |
|---|---|
| Switch ↔ bank integration | A full cross-currency transfer end to end, across both services and both databases |
| Failure branches | A refused hold fails cleanly; a refused credit reverses and releases; a frozen and a closed account each behave correctly |
| Idempotency | A replayed request returns the original response; concurrent retries place exactly one hold |
| Recovery | An abandoned transfer is driven forward to completion by the sweeper, never rolled back |
| Net settlement | Positions net to zero after a cycle |
| Ledger invariants | The append-only trigger rejects `UPDATE` and `DELETE`; every currency balances |
| **No customer money** | A schema test fails the build if any column resembling a balance appears in the switch database |
| Directory | Claiming, releasing, confusable rejection, and that a released address is never reissued |
| Currency | Minor-unit parsing, formatting, and FX application — all integer/BigInt, no floats |

Type checking across all four workspaces:

```bash
bun run typecheck
```

---

## Project scope

An honest account of what this prototype does and does not do.

| Implemented | Out of scope for this phase |
|---|---|
| Registration, login, JWT + rotating refresh tokens | Real bank integration — every institution is simulated |
| Address directory (VPA, phone, email) with confusable protection | Real KYC or identity verification |
| Bank account linking and live balance reads | Real OTP delivery (the flow exists; any code is accepted) |
| Cross-island transfers in five currencies | Fees of any kind |
| FX quotes with a 60-second lock | WebSockets and push notifications (the app polls) |
| Signed QR send and receive | NFC |
| Append-only double-entry clearing ledger | Merchant payments and cards |
| Net settlement engine and reconciliation | Fraud or AI transaction monitoring |
| Transfer saga with recovery sweeper | Admin dashboard |
| Transaction history, receipts, contacts, notifications | Biometric login |
| Prefunded debit caps per member bank | Dark mode |
| | Collect/pull requests and autopay mandates |

Two things worth stating plainly, because a judge will find them:

- **Directory key verification auto-approves.** Verifying a phone number or email accepts any code. The endpoint and the flow exist so the architecture has an answer; delivery does not. Marked `TODO(prod)` in `apps/api/src/services/directory.ts`.
- **KYC is auto-verified at signup.** The field exists for the real flow; nothing checks anything.

---

## Troubleshooting

**Port already in use** — something else owns 3000, 3100, 5432, 6379, or 8081.

```bash
# See what has the port (macOS/Linux)
lsof -i :3000
# Windows
netstat -ano | findstr :3000
```

For Redis specifically, change the host port instead of fighting for it: set `REDIS_PORT=6380` in `.env`, set `REDIS_URL=redis://localhost:6380` in `apps/api/.env`, then `docker compose up -d --force-recreate redis`. For the API and the bank, change `PORT` / `BANK_PORT` (and `BANK_BASE_URL` to match).

**`Connection closed` or `ECONNREFUSED` on Postgres** — the containers are not up, or not yet healthy.

```bash
docker compose ps          # both must say "healthy", not "starting"
docker compose up -d
docker compose logs postgres --tail 20
```

**Migrations out of sync** — symptoms are `relation ... does not exist` or a seed failing on a missing column. Rebuild the databases from zero:

```bash
docker compose down -v && docker compose up -d
# wait for healthy, then
bun run db:migrate && bun run db:migrate:bank
bun run db:seed:demo && bun run db:seed:bank
```

`docker compose down -v` deletes the database volumes. That is the point — it is also the fastest way to get back to a known-good state.

**Expo cannot reach the API** — the single most common failure. Work through it in this order:

1. Phone and computer on the **same Wi-Fi**, and the network is not "client isolation" enabled (common on guest and hotel Wi-Fi — tether to your phone's hotspot instead).
2. The API is actually running: `curl http://localhost:3000/api/v1/health` on the dev machine.
3. It is reachable over the LAN: from the dev machine, `curl http://<your-LAN-IP>:3000/api/v1/health`. If localhost works and the LAN IP does not, it is your **firewall** — see step 10 of Setup.
4. Still stuck? Force the URL explicitly: `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000 bun run dev:mobile`.
5. As a last resort, bypass the LAN entirely with a tunnel: `bun run --cwd apps/mobile start -- --tunnel`. Slower, but it works from any network.

**Redis not running** — the API starts but transfers stay stuck at `initiated`, because the saga job is never queued.

```bash
docker compose ps redis
docker compose up -d redis
docker exec caribpay-redis-1 redis-cli ping     # expect: PONG
```

If Redis is on a non-default port, confirm `REDIS_URL` in `apps/api/.env` matches `REDIS_PORT` in `.env`.

**Stale lockfile** — `bun install` fails with a version conflict, or a dependency resolves oddly after pulling.

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
bun install
```

Do not delete `bun.lock`. CI installs with `--frozen-lockfile`, so regenerating it locally will fail the build.

**Metro cannot resolve a module** — usually a stale bundler cache after switching branches.

```bash
bun run --cwd apps/mobile start -- --clear
```

The repo pins `linker = "hoisted"` in `bunfig.toml` because Metro's resolver cannot follow Bun's default isolated `node_modules` layout. If you see unresolved transitive dependencies, check that setting survived.

**A transfer is stuck mid-flight** — check what the books think:

```bash
bun run reconcile
```

It reports stalled transfers and any hold stranded at a bank. The recovery sweeper picks up abandoned transfers automatically and always drives them forward.

---

## Team

Built by students of the **CFBC AI Coding Club** for the CANTO Innovation Challenge 2026.

| Contributor | Role |
|---|---|
| Fraimer | Architecture, switch API, clearing ledger, mobile app |

---

## License

MIT — see [LICENSE](LICENSE).

---

## Further reading

| Document | What it covers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | The project constitution: engineering rules and the invariants that make this a switch rather than a wallet |
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | System briefing — how it works and where the seams are |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Users, positioning, and the regulatory argument |
| [docs/DEMO.md](docs/DEMO.md) | The five-minute live demo script |
| [docs/DESIGN.md](docs/DESIGN.md) | The visual system: colour, type, spacing |
| [docs/SCREENS.md](docs/SCREENS.md) | Every screen and the states it has |
| [docs/RUNNING.md](docs/RUNNING.md) | Machine-specific runbook for the Windows + WSL2 dev box |
