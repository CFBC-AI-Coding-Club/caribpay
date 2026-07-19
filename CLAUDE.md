# CaribPay — Project Constitution

**Project:** CaribPay — a regional payment interoperability platform for the Caribbean. Consumer-facing wallet app riding atop CAPSS (Caribbean Payment and Settlement System). Multi-currency (XCD, JMD, BBD, TTD, USD), instant cross-island wallet-to-wallet transfers, QR-based receive/pay.

**Context:** This is a Phase 2 prototype for the CANTO Innovation Challenge 2026 (judging Aug 26–27). Goal: working infrastructure and a demoable end-to-end money movement flow. Not production; but the ledger must be architecturally honest — no shortcuts that would embarrass us in technical Q&A.

## Stack (non-negotiable)

| Layer | Choice |
|---|---|
| Runtime | Bun (latest stable) |
| API framework | Hono |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Database | PostgreSQL 16 |
| Queue/cache | Redis 7 + BullMQ (`maxmemory-policy noeviction`) |
| Validation | Zod (shared package, single source of truth) |
| Mobile | React Native via Expo (latest SDK), expo-router, TypeScript strict |
| Mobile data | TanStack Query (server state), Zustand (client state) |
| Auth | JWT access (15 min) + rotating refresh tokens (30 d), `Bun.password` (argon2id) |
| Local dev | Docker Compose (postgres + redis only; API runs on host via Bun) |
| Deploy target | Ubuntu VPS, pm2, Caddy reverse proxy, GitHub Actions CI/CD |

## Repository layout (Bun workspaces monorepo)

```
caribpay/
├── CLAUDE.md
├── package.json              # workspaces: ["apps/*", "packages/*"]
├── docker-compose.yml        # postgres + redis for local dev
├── .github/workflows/ci.yml
├── apps/
│   ├── api/                  # Bun + Hono
│   │   ├── src/
│   │   │   ├── index.ts      # server entry
│   │   │   ├── routes/       # one file per resource
│   │   │   ├── services/     # business logic (ledger, fx, transfers)
│   │   │   ├── settlement/   # SettlementProvider interface + MockCapssProvider
│   │   │   ├── workers/      # BullMQ workers
│   │   │   ├── db/           # drizzle schema, client, migrations
│   │   │   └── middleware/   # auth, error handler, request-id
│   │   └── drizzle.config.ts
│   └── mobile/               # Expo app
│       ├── app/              # expo-router file-based routes
│       ├── src/
│       │   ├── api/          # typed client using packages/shared schemas
│       │   ├── components/
│       │   └── stores/       # zustand
│       └── app.json
└── packages/
    └── shared/               # zod schemas, types, currency utils, constants
        └── src/
            ├── schemas/      # request/response zod schemas per resource
            ├── currency.ts   # minor-unit math, formatting
            └── constants.ts  # supported currencies, transfer states
```

## Engineering rules

1. **TypeScript strict everywhere.** No `any` without an inline justification comment.
2. **All money is integers in minor units** (cents). Never floats. `packages/shared/currency.ts` is the only place arithmetic/formatting on money happens.
3. **Every API request and response shape is a Zod schema in `packages/shared`** — the API validates with it, the mobile client parses with it. Never define a shape twice.
4. **The ledger is append-only.** No UPDATE or DELETE on `ledger_entries`, ever. Balances are derived, never stored as a mutable column (a cached balance table is allowed but must be reconcilable from entries).
5. **Every money-moving endpoint requires an idempotency key** (`Idempotency-Key` header, persisted, replayed responses on duplicates).
6. **Errors:** central Hono error handler; consistent envelope `{ error: { code, message } }`; never leak stack traces.
7. **Commits:** conventional commits, one commit per completed sub-task.
8. Prefer boring, readable code over clever code. This will be maintained by four students under deadline.

## Local environment note

Docker on this machine runs inside WSL2 Ubuntu (no Docker Desktop). The PowerShell `docker` command is a shim that forwards to WSL; published ports are reachable from Windows at `localhost`. The redis container maps to host port 6380 here (native WSL redis owns 6379) — see the root `.env`.

**Run `bun test` through WSL on this machine** (`wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/fraim/Projects/caribpay && ~/.bun/bin/bun test"`): Bun for Windows (≤1.3.14) segfaults in bun:test under postgres connection churn. Plain `bun` scripts (dev server, migrate, seed) are fine on Windows. Linux/macOS teammates and CI are unaffected.

---

# Architecture Overview

```
┌─────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│ Expo mobile │ ───────────────────────► │ Hono API (Bun)           │
│ (RN, TS)    │ ◄─── TanStack Query ──── │  ├─ auth (JWT)           │
└─────────────┘                          │  ├─ wallets / balances   │
                                         │  ├─ transfers            │
                                         │  ├─ fx quotes            │
                                         │  └─ qr payloads          │
                                         └───────┬──────────┬───────┘
                                                 │          │
                                          Drizzle│          │BullMQ
                                                 ▼          ▼
                                         ┌───────────┐  ┌──────────────────┐
                                         │ Postgres  │  │ Redis + workers  │
                                         │ (ledger)  │  │ settlement queue │
                                         └───────────┘  └────────┬─────────┘
                                                                 ▼
                                                    ┌────────────────────────┐
                                                    │ SettlementProvider     │
                                                    │  └ MockCapssProvider   │
                                                    │    (future: real CAPSS)│
                                                    └────────────────────────┘
```

**Transfer lifecycle (the demo centerpiece):**
`initiated` → (ledger holds debited) → `pending_settlement` → (BullMQ job, 2–5 s simulated CAPSS delay) → `settled` (credit posted) — or → `failed` (hold reversed). The mobile app shows this transition live via polling (TanStack Query refetch interval on the transfer detail; WebSockets are out of scope for this phase).

---

# Data Model (Drizzle / Postgres)

All tables get `id` (uuid, default `gen_random_uuid()`), `created_at`, `updated_at` unless noted. Use Drizzle's `pgEnum` for enums.

## users
- `email` text unique not null
- `password_hash` text not null
- `full_name` text not null
- `country_code` char(2) not null — ISO 3166 (KN, JM, BB, TT, VC, …)
- `kyc_status` enum: `unverified | pending | verified` (default `unverified`; prototype auto-verifies on signup, but the field exists)

## refresh_tokens
- `user_id` fk → users, `token_hash` text, `expires_at`, `revoked_at` nullable

## wallets
One wallet per user per currency.
- `user_id` fk → users
- `currency` enum: `XCD | JMD | BBD | TTD | USD`
- `address` text unique not null — human-shareable, format `CW-XXXX-XXXX-XXXX-XXXX`
- unique index on (`user_id`, `currency`)

## system_accounts
Internal counterparty accounts so every ledger transaction balances.
- `type` enum: `fx_liquidity | settlement_clearing | fee_revenue`
- `currency` enum (same as wallets)
- unique on (`type`, `currency`). Seeded at migration time.

## transactions
One row per logical money movement.
- `type` enum: `p2p_transfer | deposit | withdrawal | fx_conversion`
- `status` enum: `initiated | pending_settlement | settled | failed`
- `idempotency_key` text unique not null
- `sender_user_id` / `recipient_user_id` nullable fks
- `source_currency`, `dest_currency`, `source_amount_minor` bigint, `dest_amount_minor` bigint
- `fx_rate_used` numeric(18,8) nullable
- `failure_reason` text nullable
- `settled_at` timestamptz nullable

## ledger_entries  (append-only — enforce with a Postgres trigger that raises on UPDATE/DELETE)
- `transaction_id` fk → transactions
- `account_type` enum: `user_wallet | system`
- `wallet_id` nullable fk → wallets
- `system_account_id` nullable fk → system_accounts
- `direction` enum: `debit | credit`
- `amount_minor` bigint not null, > 0
- `currency` enum
- **Invariant (enforced in the ledger service, asserted in tests):** per transaction per currency, sum(debits) = sum(credits).

## wallet_balances (cache, rebuildable)
- `wallet_id` pk fk, `balance_minor` bigint, `as_of_entry_created_at`
- Updated in the same DB transaction as entry insertion. A `bun run reconcile` script must recompute all balances from `ledger_entries` and diff against this table.

## fx_rates
- `base_currency`, `quote_currency`, `rate` numeric(18,8), `valid_from` timestamptz
- Seeded with realistic static rates (XCD is USD-pegged at 2.70; derive crosses). Service reads the latest row per pair. No external API calls.

## idempotency_records
- `key` text pk, `user_id`, `request_hash` text, `response_status` int, `response_body` jsonb, `expires_at`

---

# API Surface (v1, prefix `/api/v1`)

All bodies validated with shared Zod schemas. Auth = Bearer access token unless marked public.

| Method & path | Purpose | Notes |
|---|---|---|
| POST `/auth/register` (public) | email, password, fullName, countryCode | Creates user + one wallet in home currency + auto-verifies KYC (prototype). Returns tokens. |
| POST `/auth/login` (public) | | Returns access + refresh. |
| POST `/auth/refresh` (public) | | Rotates refresh token. |
| POST `/auth/logout` | | Revokes refresh token. |
| GET `/me` | Profile + kyc status | |
| GET `/wallets` | All wallets with cached balances + total in home currency (via fx) | Powers the home screen balance card. |
| POST `/wallets` | Create wallet in another supported currency | |
| GET `/wallets/:id/transactions` | Paginated (cursor) transaction history for that wallet | |
| GET `/fx/quote?from=XCD&to=JMD&amountMinor=150000` | Returns rate, destAmountMinor, quoteExpiresAt (60 s) | Powers the live converter on the Send screen. |
| POST `/transfers` | Body: recipientAddress, sourceCurrency, destCurrency, sourceAmountMinor, note?. Header: Idempotency-Key. | Validates balance, writes hold entries, enqueues settlement, returns transaction in `pending_settlement`. |
| GET `/transfers/:id` | Status + full detail | Mobile polls this (2 s interval) until terminal state. |
| GET `/transactions` | Unified paginated feed across wallets | Powers "Regional Transfers" list. |
| GET `/qr/receive` | Returns wallet address + a signed QR payload string `caribpay://pay?...` | |
| POST `/contacts` / GET `/contacts` | Quick contacts (userId or wallet address + display name) | |
| GET `/health` (public) | db + redis check | For CI and pm2. |

**Ledger postings for a cross-currency P2P (XCD → JMD), the flow judges will see:**
1. Debit sender XCD wallet `source_amount_minor`; credit `fx_liquidity(XCD)` — same amount.
2. Debit `fx_liquidity(JMD)` `dest_amount_minor`; credit recipient JMD wallet — same amount.
Both currency legs balance independently. Same-currency transfers post a single leg. Fees are out of scope (transfer fee = free, matching the UI).

---

# Settlement Layer

```ts
// apps/api/src/settlement/provider.ts
export interface SettlementProvider {
  /** Submit a transfer for inter-institution settlement. Resolves when accepted, not settled. */
  submit(tx: SettlementRequest): Promise<{ providerRef: string }>;
  /** Called by the worker to check/complete settlement. */
  poll(providerRef: string): Promise<"pending" | "settled" | "failed">;
}
```

`MockCapssProvider` implements this: `submit` returns a fake reference instantly; `poll` returns `settled` after a randomized 2–5 s delay (configurable via env `MOCK_SETTLEMENT_DELAY_MS`), with a 2% random failure rate toggleable via `MOCK_SETTLEMENT_FAILURES=true` (default false for demos). The BullMQ worker `settlement-worker` consumes jobs from the `settlement` queue, polls the provider, and on `settled` posts the credit leg + flips transaction status; on `failed` reverses the hold. All status flips happen inside a DB transaction.

This interface is the architectural answer to "how does this connect to CAPSS?" — the real provider is a drop-in implementation later.

---

# Explicitly Out of Scope (do not build, do not stub UI for)

Real CAPSS/bank integration, real KYC, NFC, push notifications, WebSockets, fraud/AI monitoring, merchant payments, fees, admin dashboard, biometrics, dark mode. If any of these seem "quick to add," don't — flag it and continue.
