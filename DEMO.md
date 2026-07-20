# CaribPay — CANTO Demo Script

A ~4-minute live demo: move money from St. Kitts (XCD) to Jamaica (JMD) and
watch it settle through the (mock) CAPSS rail in real time.

---

## 1. One-time setup (from a clean clone)

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install dependencies
bun install

# 3. Create the schema
bun run db:migrate

# 4. Seed the demo world (4 island users, funded wallets, contacts, history)
bun run db:seed:demo --reset
```

Then start the backend:

```bash
bun run dev:api      # Hono API + in-process settlement worker on :3000
```

### Installing the mobile app (development build)

The app runs on **Expo SDK 57**, which is newer than the Expo Go published to the
app stores — so it uses a **development build** (a small custom client) instead
of Expo Go. You build the client once, install it on the phone, then iterate
with the Metro dev server just like Expo Go.

**Build the dev client once (cloud, no local Android SDK needed):**

```bash
cd apps/mobile
bunx eas login             # first time only; needs a free Expo account
bunx eas init              # first time only; links the project, writes the EAS project id
bunx eas build --profile development --platform android
```

EAS returns an install link / QR for the resulting `.apk` — open it on the phone
and install (allow "install from unknown sources"). The `development` profile is
defined in `apps/mobile/eas.json`.

> **Local alternative** (if you have Android Studio + SDK and a device/emulator):
> `cd apps/mobile && bunx expo run:android` builds and installs the dev client
> directly, no Expo account required.

**Then, for the demo and every day after, just start Metro:**

```bash
bun run dev:mobile         # Expo dev server; open the dev-client app and it connects
```

Open the installed **CaribPay** dev-client app on the phone (not Expo Go) — it
auto-connects to the Metro server, or scan the QR it shows.

> **Physical device note:** the app auto-targets your dev machine's LAN IP at
> port 3000. Make sure the phone is on the same Wi‑Fi and that inbound TCP 3000
> is allowed through the host firewall. To force a specific address, set
> `EXPO_PUBLIC_API_URL=http://<your-ip>:3000` before `dev:mobile`.

### Demo accounts (password: `demo1234`)

| Name                | Email                   | Island      | Currency |
| ------------------- | ----------------------- | ----------- | -------- |
| Amara Liburd        | amara@caribpay.test     | St. Kitts   | XCD      |
| Devon Campbell      | devon@caribpay.test     | Jamaica     | JMD      |
| Shanice Braithwaite | shanice@caribpay.test   | Barbados    | BBD      |
| Ravi Maharaj        | ravi@caribpay.test      | Trinidad    | TTD      |

Each starts with a funded wallet, three pre-linked contacts, and ~15 historical
regional transfers so the feed looks lived-in.

---

## 2. The click-path (what to show the judges)

**Act 1 — The sender (St. Kitts).**
1. Log in as **amara@caribpay.test** / `demo1234`.
2. On **Home**, point out the **total balance (~XCD 5,347)** and the
   **Regional transfers** feed — real history across islands.

**Act 2 — Send across the region.**
3. Go to the **Send** tab.
4. Tap the **Devon** contact chip — it fills Devon's Jamaica wallet address.
   *(Alternatively: open Devon's **Receive** screen on a second device and scan
   the QR — same result, signature-verified.)*
5. **From wallet:** XCD. **Recipient receives:** JMD.
6. Enter **1500** as the amount. The **live FX quote** appears:
   *They receive ≈ **JMD 87,777.78** at 1 XCD = 58.518… JMD.*
7. Tap **Send.**

**Act 3 — Live settlement (the centerpiece).**
8. The app jumps to the **transfer detail** screen showing **Pending —
   "Settling through CAPSS…"** with a spinner.
9. In **2–5 seconds** it flips to **Settled** on its own (polling, no refresh).
   The sender's balance has dropped by XCD 1,500.

**Act 4 — The recipient (Jamaica).**
10. Sign out (Menu → Sign out) and log in as **devon@caribpay.test** /
    `demo1234`.
11. On **Home**, the new **+JMD 87,777.78** transfer sits at the top of the
    feed and the JMD balance reflects it.

**Talking point:** the money moved through a `SettlementProvider` interface with
a `MockCapssProvider` behind it. Swapping in the real CAPSS connection is a
drop-in implementation — the ledger, holds, and reversals are already built and
reconcilable.

---

## 3. Reset between runs

```bash
# Wipe all data and reseed the demo world from scratch
bun run db:seed:demo --reset
```

Running `bun run db:seed:demo` **without** `--reset` is a no-op if the demo
users already exist (it will tell you to use `--reset`).

To prove the ledger is honest at any time:

```bash
bun run reconcile   # recomputes every balance from ledger_entries; must be clean
```

---

## 4. If something looks off

- **App can't reach the API:** confirm `bun run dev:api` is up, the phone is on
  the same network, and TCP 3000 is open on the host firewall. Verify with
  `curl http://localhost:3000/api/v1/health` → `{"status":"ok",...}`.
- **Transfer stuck on Pending:** the settlement worker runs in-process with
  `dev:api`; check that terminal for errors and that Redis is up
  (`docker compose ps`).
- **Balances look wrong:** run `bun run reconcile`; then re-seed with `--reset`.
- **"Incompatible with Expo Go":** expected — this app uses a development build,
  not Expo Go. Install the dev client (see setup above) and open that app.
