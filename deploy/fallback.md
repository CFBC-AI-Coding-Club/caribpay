# The fallback demo

`v0.1.0-wallet-demo` is the working wallet prototype, tagged immediately before the overlay-switch
pivot deletes the `wallets` table. Stand it up now and leave it running. If the pivot has not
stabilised by **20 August**, this is what goes on screen on the 26th.

Set this up **before migration 0005**. Afterwards the pivot branch cannot produce this build.

---

## What has to be isolated, and why

A second pm2 process on a second port is not enough. The pivot and the fallback share three stateful
resources, and two of them will destroy the fallback silently.

| Resource | Fallback uses | If shared |
|---|---|---|
| Postgres | `caribpay_demo` | Migration 0005 `DROP`s `wallets` and `wallet_balances`. The fallback's entire data model is gone, and it will not start. |
| Redis | db index **3** | BullMQ prefixes keys `bull` in both trees. On one index the two settlement workers consume each other's jobs — transfers settle against the wrong database and both demos corrupt. |
| Port | 3001 | Obvious, and the only one that fails loudly. |

The Redis one is the trap: nothing errors, jobs just get picked up by the wrong worker.

---

## Setup

**1. A worktree pinned at the tag,** so the fallback source cannot drift as the branch moves:

```bash
cd ~/caribpay
git worktree add ~/caribpay-fallback v0.1.0-wallet-demo
cd ~/caribpay-fallback && bun install
```

**2. Its own database, seeded with the demo world:**

```bash
createdb -U caribpay caribpay_demo
cd ~/caribpay-fallback
DATABASE_URL=postgresql://caribpay:caribpay@localhost:5432/caribpay_demo bun run db:migrate
DATABASE_URL=postgresql://caribpay:caribpay@localhost:5432/caribpay_demo bun run db:seed
DATABASE_URL=postgresql://caribpay:caribpay@localhost:5432/caribpay_demo bun run db:seed:demo -- --reset
```

**3. The pm2 processes:**

```bash
pm2 start ~/caribpay-fallback/deploy/ecosystem.fallback.cjs
pm2 save
```

**4. The Caddy route** — add to `/etc/caddy/Caddyfile` alongside the main block, then
`sudo systemctl reload caddy`:

```
demo.caribpay.example {
	encode gzip
	reverse_proxy localhost:3001

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		-Server
	}

	log {
		output file /var/log/caddy/caribpay-fallback.log
	}
}
```

**5. Verify:**

```bash
curl -s https://demo.caribpay.example/api/v1/health     # {"status":"ok","db":"up","redis":"up"}
cd ~/caribpay-fallback && DATABASE_URL=...caribpay_demo bun run reconcile
```

---

## The phone

The API is only half the demo — the money shot is a transfer settling on a handset, and the app has
to point at the fallback.

Cheapest option, and the one to rehearse: run Metro from the worktree with the API URL forced.

```bash
cd ~/caribpay-fallback/apps/mobile
EXPO_PUBLIC_API_URL=https://demo.caribpay.example bun run start
```

`apps/mobile/src/config.ts` honours `EXPO_PUBLIC_API_URL` above its auto-derived value, and the tag
is on Expo SDK 54, so plain Expo Go works — no dev build needed.

**Rehearse this once, on the actual phone, before 8 August.** A fallback nobody has run is not a
fallback. Log in as `amara@caribpay.test` / `demo1234` and send to Devon; if the transfer settles,
the fallback is real.

---

## Deciding to use it

The call is on **20 August**. The question is not "is the pivot finished" but "does the saga hold" —
concretely: does a transfer complete, does a refused credit reverse cleanly, and does
`bun run reconcile` come back green. If any of those is shaky, demo the fallback and present the
switch architecture as the roadmap. That is a coherent story, and a working prototype plus a credible
plan beats a broken switch.

Tear the fallback down only after judging.
