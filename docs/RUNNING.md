# Running CaribPay on this machine

Machine-specific runbook for the Windows 11 + WSL2 dev box. Teammates on Linux/macOS can
ignore the WSL parts and run everything natively.

Almost everything runs on **Windows**. Only two things need WSL: the Docker containers
(Docker Engine lives there), and `bun test`.

---

## The one thing that breaks everything

Docker Engine runs inside WSL2 Ubuntu — there is no Docker Desktop. **With no persistent
`wsl.exe` process, WSL tears the distro down ~10 s after the last command exits**, taking
dockerd and both containers with it. Everything then fails in confusing, inconsistent ways:
`ERR_POSTGRES_CONNECTION_CLOSED` mid-query, `ECONNREFUSED` on Redis, `db:migrate` dying on
`CREATE SCHEMA` seconds after a successful connection test.

A scheduled task holds WSL open, but **it does not survive a reboot on its own** — it shows
`Ready` (registered, not running).

**Check this first, before debugging anything else:**

```powershell
(Get-Process wsl -ErrorAction SilentlyContinue).Count      # must be > 0
```

If it's `0`:

```powershell
Start-ScheduledTask -TaskName "WSL2-Docker-Keepalive"
```

Then wait ~30 s for the containers to report `(healthy)` before retrying whatever failed.

---

## One-time setup

```powershell
bun install
docker compose up -d
bun run db:migrate            # the switch
bun run db:migrate:bank       # the member banks
bun run db:seed:demo -- --reset
bun run db:seed:bank
```

Two databases, on purpose: `caribpay` is the switch, `caribpay_bank` is the simulated member
banks. The switch has no credentials for the bank database — that boundary is what makes
"CaribPay holds no customer money" inspectable rather than asserted.

Config is committed at `apps/api/.env` — Postgres URL, Redis on **6380**, JWT and QR
secrets, mock-settlement knobs. Nothing to fill in. Port 6380 is deliberate: your own native
WSL Redis owns 6379 and must not be touched.

---

## Every session — four terminals

**1. Containers** (PowerShell)

```powershell
(Get-Process wsl).Count                # > 0, else Start-ScheduledTask (see above)
docker compose up -d
docker ps                              # wait for both (healthy), ~20s
```

**2. Simulated member banks** (PowerShell)

```powershell
bun run dev:bank                       # :3100
curl.exe -s http://localhost:3100/health
```

Start this **before** the API: the switch calls it for every balance read and every transfer.

**3. The switch + workers** (PowerShell)

```powershell
bun run dev:api
```

The transfer worker and the recovery sweeper run in-process by default, so this is the rest of
the backend. Gate on this before moving on:

```powershell
curl.exe -s http://localhost:3000/api/v1/health
# {"status":"ok","db":"up","redis":"up"}
```

`"db":"down"` right after boot ⇒ containers still starting. `"db":"down"` persistently ⇒
check the keepalive.

**4. Metro** (PowerShell)

```powershell
bun run dev:mobile
```

The app is on **Expo SDK 54**, so plain **Expo Go** works — scan the QR code. No dev build
needed.

Your phone reaches both Metro (`:8081`) and the API (`:3000`) at `192.168.50.216`;
`bun.exe` already has an inbound Windows Firewall allow rule on the Public profile, which is
the profile your Wi-Fi uses. The app derives the API URL from Expo's host automatically, so
there is nothing to configure.

If the network is ever uncooperative, override it — `apps/mobile/src/config.ts` honours
`EXPO_PUBLIC_API_URL` above the auto-derived value:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.50.216:3000"; bun run dev:mobile
```

---

## What actually needs WSL

**`bun test` only.** It hangs indefinitely on Windows against Postgres (verified: no output
after 5 minutes, and prior sessions saw hard segfaults under connection churn). Run it in
WSL:

```powershell
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/fraim/Projects/caribpay && ~/.bun/bin/bun test"
```

Everything else — both servers, `db:migrate`, the seeds, `reconcile`, `settle` — works fine on
Windows *provided WSL is being kept alive*. Earlier guidance in this repo said
otherwise; that was the keepalive problem being misread as a Bun-on-Windows driver bug.

---

## Demo accounts

Seeded by `db:seed:demo`, password **`demo1234`** for all:

| Email | Name | Address | Bank |
|---|---|---|---|
| `amara@caribpay.test` | Amara Liburd | `amara@caribpay` | SKNANB (XCD) |
| `devon@caribpay.test` | Devon Campbell | `devon@caribpay` | NCB Jamaica (JMD) |
| `shanice@caribpay.test` | Shanice Braithwaite | `shanice@caribpay` | Republic Barbados (BBD) |
| `ravi@caribpay.test` | Ravi Maharaj | `ravi@caribpay` | Republic T&T (TTD) |

They have linked bank accounts, verified phone keys, and each other as pinned contacts.
**Amara → Devon** is the money shot: XCD → JMD exercises the FX quote, the 60-second lock, the
two-bank saga, and the cross-currency clearing legs. See `DEMO.md` for the script.

Reset to a clean slate — **both commands**, or balances stay where the last run left them:

```powershell
bun run db:seed:demo -- --reset        # the switch
bun run db:seed:bank                   # the banks: balances reset, holds cleared
```

---

## Checks

```powershell
bun run typecheck                      # shared + api + mock-bank + mobile
bun run reconcile                      # positions, caps, stalled transfers, stranded holds
bun run settle                         # net member-bank positions to zero
cd apps/mobile; bun x expo export --platform android   # proves Metro resolves everything
```

```powershell
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/fraim/Projects/caribpay && ~/.bun/bin/bun test"
# 138 pass
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_POSTGRES_CONNECTION_CLOSED`, `ECONNREFUSED :6380`, `db:migrate` fails on `CREATE SCHEMA`, containers show "Up 1 second" | **WSL torn down** — no keepalive | `Start-ScheduledTask -TaskName "WSL2-Docker-Keepalive"`, wait 30 s |
| `bun test` hangs or segfaults | Genuine Bun-on-Windows bug with Postgres | Run it in WSL |
| `health` says `"db":"down"` just after boot | Containers still starting | Wait ~20 s, `docker ps` until `(healthy)` |
| App loads on the phone, every request fails | API not running, or on a different host than Metro | Start `bun run dev:api` on Windows; or set `EXPO_PUBLIC_API_URL` |
| Balances show "unavailable", transfers stall | Mock bank not running | `bun run dev:bank`, then check `http://localhost:3100/health` |
| "They can't receive money yet" | That user has an address but no linked account | Connect one on their device — inherent to the model |
| Balances start from the wrong number | Reseeded the switch but not the banks | Run `bun run db:seed:bank` too |
| Metro: `Unable to resolve @expo/metro-runtime/error-overlay` | Stale hoisted dep after an SDK change | Delete `bun.lock` **and** all `node_modules`, then `bun install` |
| `expo export`: "Stripping types unsupported under node_modules" | `expo-status-bar` in `app.json` `plugins` | Remove it — no config plugin on SDK 54 |
| QR scan rejects a code you just generated | Two sides signed with different `QR_HMAC_SECRET` | Always start the API with `bun run dev:api` so `apps/api/.env` loads |
| `Test-NetConnection` says a port is closed but it works | Unreliable against WSL-forwarded ports | Verify with a real connection instead |

---

## Note on WSL networking mode

`C:\Users\fraim\.wslconfig` currently has `networkingMode=mirrored` (original saved at
`.wslconfig.bak`). This was added while chasing the connectivity problem above; it turned
out **not** to be necessary, since the API runs on Windows. It is harmless and does make
Windows↔WSL port access more predictable, so it has been left in place.

To revert: restore `.wslconfig.bak` and `wsl --shutdown`.

Note that under mirrored mode, inbound traffic to WSL goes through a **Hyper-V** firewall
that defaults to `DefaultInboundAction: Block`. That only matters if you ever run a service
*inside* WSL and want to reach it from the network — then add a scoped rule (admin):

```powershell
New-NetFirewallHyperVRule -Name "CaribPay-API-3000" -DisplayName "CaribPay API (WSL)" `
  -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' `
  -Protocol TCP -LocalPorts 3000 -Action Allow
```

Prefer that over the widely-copied `Set-NetFirewallHyperVVMSetting … -DefaultInboundAction
Allow`, which exposes every port in the WSL VM — including your Postgres and Redis.
