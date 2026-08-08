# CaribPay — Project Constitution

**Project:** CaribPay — a **payment switch** for the Caribbean: the messaging and clearing layer between member banks, in the mould of UPI and PAPSS. It is **not a wallet** and never holds customer money. Multi-currency (XCD, JMD, BBD, TTD, USD), instant cross-island transfers addressed by a human-readable address (`amara@caribpay`), phone, email, or signed QR.

**Context:** This is a Phase 2 prototype for the CANTO Innovation Challenge 2026 (judging Aug 26–27). Goal: working infrastructure and a demoable end-to-end money movement flow. Not production; but the clearing ledger and the bank connections must be architecturally honest — no shortcuts that would embarrass us in technical Q&A.

**Never use the name CAPSS.** We are building the settlement system, not integrating with someone else's.

## Stack (non-negotiable)

| Layer | Choice |
|---|---|
| Runtime | Bun (latest stable) |
| API framework | Hono |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Database | PostgreSQL 16 — **two databases**: `caribpay` (switch) and `caribpay_bank` (member banks) |
| Queue/cache | Redis 7 + BullMQ (`maxmemory-policy noeviction`) |
| Validation | Zod (shared package, single source of truth) |
| Mobile | React Native via Expo (latest SDK), expo-router, TypeScript strict |
| Mobile data | TanStack Query (server state), Zustand (client state) |
| Auth | JWT access (15 min) + rotating refresh tokens (30 d), `Bun.password` (argon2id) |
| Local dev | Docker Compose (postgres + redis only; services run on host via Bun) |
| Deploy target | Ubuntu VPS, pm2, Caddy reverse proxy, GitHub Actions CI/CD |

## Repository layout (Bun workspaces monorepo)

```
caribpay/
├── CLAUDE.md
├── package.json              # workspaces: ["apps/*", "packages/*"]
├── docker-compose.yml        # postgres + redis; init creates both databases
├── apps/
│   ├── api/                  # THE SWITCH — Bun + Hono
│   │   └── src/
│   │       ├── routes/       # one file per resource
│   │       ├── services/     # directory, accounts, transfers, clearing, notifications
│   │       ├── banks/        # BankConnector interface + HTTP implementation
│   │       ├── settlement/   # OUR netting engine (not someone else's rail)
│   │       ├── workers/      # transfer saga + recovery sweeper
│   │       ├── db/           # drizzle schema, migrations, seeds, reconcile
│   │       └── middleware/   # auth, idempotency, rate-limit, error handler
│   ├── mock-bank/            # THE MEMBER BANKS — separate app, separate database
│   │   └── src/              # accounts, holds, debits, credits
│   └── mobile/               # Expo app
└── packages/
    └── shared/               # zod schemas, vpa logic, currency utils, institutions
```

## Engineering rules

1. **TypeScript strict everywhere.** No `any` without an inline justification comment.
2. **All money is integers in minor units** (cents). Never floats. `packages/shared/currency.ts` is the only place arithmetic/formatting on money happens.
3. **Every API request and response shape is a Zod schema in `packages/shared`** — including the switch↔bank wire contract. Never define a shape twice.
4. **The clearing ledger is append-only.** No UPDATE or DELETE on `ledger_entries`, ever, enforced by a Postgres trigger. Positions are derived, never stored as a mutable column.
5. **Every money-moving endpoint requires an idempotency key**, persisted and replayed on duplicates. **The key is claimed by INSERT before the handler runs** — check-then-act is a race that lets concurrent retries all execute.
6. **Errors:** central Hono error handler; consistent envelope `{ error: { code, message } }`; never leak stack traces.
7. **Commits:** conventional commits, one commit per completed sub-task.
8. Prefer boring, readable code over clever code. This will be maintained by four students under deadline.

## The rules that make this a switch

These are not style preferences. Breaking one changes what the product legally is, or loses someone's money.

1. **CaribPay holds no customer money.** No column in the `caribpay` database may hold a customer balance; `apps/api/test/schema.test.ts` fails if one appears. This is what makes us a payment initiation and clearing operator rather than an e-money issuer.
2. **The switch reaches customer accounts only over HTTP, through `BankConnector`.** It has no credentials for `caribpay_bank`. Direct SQL across that boundary is forbidden.
3. **Idempotency keys sent to a bank are derived, never generated:** `` `${transactionId}:${step}` ``, from `packages/shared/idempotency.ts`. A retry must replay, not repeat. Adding randomness, a timestamp, or an attempt counter here reintroduces double-spend.
4. **A refusal is actionable; an unknown is not.** `BankRefusedError` (a code in `BANK_REFUSAL_CODES`) means the bank says it did not happen — safe to fail or reverse. Anything else — timeout, 5xx, in-flight — is `BankUnknownError`: re-send the identical instruction. **Never reverse on an unknown credit**; it may have landed, and releasing would leave the switch short.
5. **Recovery drives forward, never back.** Past the credit the money has irrevocably reached the payee.
6. **A released directory key is never reissued**, to anyone. Uniqueness on value and skeleton is global, covering released rows.

---

# Architecture Overview

```
┌─────────────┐      HTTPS/JSON       ┌──────────────────────────┐     HTTP     ┌────────────────┐
│ Expo mobile │ ────────────────────► │ apps/api  (the switch)   │ ───────────► │ apps/mock-bank │
│ (RN, TS)    │ ◄── TanStack Query ── │  ├─ auth (JWT)           │ ◄─────────── │  accounts      │
└─────────────┘                       │  ├─ directory (VPA)      │  BankConnector│  holds         │
                                      │  ├─ linked accounts      │              │  debits        │
                                      │  ├─ transfers (saga)     │              │  credits       │
                                      │  ├─ clearing + netting   │              └───────┬────────┘
                                      │  └─ fx quotes            │                      │
                                      └────┬──────────────┬──────┘                      ▼
                                    Drizzle│              │BullMQ              caribpay_bank (PG)
                                           ▼              ▼                    ← no switch access
                                   caribpay (PG)   Redis + workers
                                   clearing ledger  saga + recovery sweeper
                                   NO customer balances
```

**Transfer lifecycle (the demo centrepiece):**

```
initiated → debit_pending → debit_held → credit_pending → completed
                    ↘ failed                    ↘ reversal_pending → reversed
```

1. Resolve the address to a member bank and an account.
2. Ask the **payer's bank** for a hold. Refused → `failed`, nothing posted.
3. Ask the **payee's bank** to credit. Refused → `reversal_pending` → release → `reversed`.
4. Confirm the hold as a settled debit; post the clearing entries and the recipient's notification in one DB transaction → `completed`.

`driveTransfer()` in `services/transfers.ts` is one resumable function shared by the worker and the recovery sweeper.

---

# Data Model (Drizzle / Postgres)

All tables get `id` (uuid), `created_at`, `updated_at` unless noted.

## Switch database (`caribpay`)

**users** — email, password_hash, full_name, country_code, kyc_status.

**institutions** — the member banks. `legal_name`, `display_name`, `country_code`, `currency`, `psp_handle` (unique, the `@suffix`), `psp_status` (`active | planned`), `supports_account_linking`, `reserved_aliases[]`, `sort_order`. Seeded from `packages/shared/institutions-data.ts`, the single list both services read.

**linked_accounts** — `user_id`, `institution_id`, `account_ref`, `account_number_masked`, `currency`, `holder_name_verified`, `is_default`, `status`. **No balance column, ever.**

**directory_keys** — `user_id`, `type` (`vpa | phone | email`), `value_raw`, `value_normalized` (globally unique), `skeleton` (globally unique, VPA only), `institution_id`, `linked_account_id` (nullable → default account), `is_primary`, `verified_at`, `released_at`.

**system_accounts** — clearing accounts: `bank_position` (one per member bank per currency, with `debit_cap_minor`), plus `fx_liquidity`, `settlement_clearing`, `fee_revenue` per currency.

**transactions** — `type`, `status` (the eight lifecycle states), `idempotency_key`, sender/recipient user ids, `payer_account_id`, `payee_account_id`, amounts, `fx_rate_used`, `recipient_key_used` + `recipient_name_snapshot` (so a receipt reads correctly after a handle changes), `hold_ref`, `debit_ref`, `credit_ref`, `deadline_at`.

**ledger_entries** *(append-only)* — `transaction_id`, `system_account_id` (NOT NULL), `direction`, `amount_minor`, `currency`. Every entry is a system-account entry; there is no customer side.
**Invariant:** per transaction per currency, sum(debits) = sum(credits).

**settlement_cycles** / **settlement_cycle_entries**, **notifications**, **contacts**, **fx_rates**, **idempotency_records**, **refresh_tokens**.

## Bank database (`caribpay_bank`)

**accounts** (`account_ref`, `institution_handle`, `holder_name`, `currency`, `balance_minor`, `status`), **holds** (with `expires_at` so nothing strands), **debits**, **credits**, **bank_idempotency_records**.

**This is where customer money lives.** The switch has no credentials for it.

---

# API Surface (v1, prefix `/api/v1`)

| Method & path | Purpose |
|---|---|
| POST `/auth/register` (public) | Creates user + mints a neutral default address. No wallet. |
| POST `/auth/login` · `/auth/refresh` · `/auth/logout` | |
| GET `/me` | |
| GET `/institutions` | Member banks, for the linking picker and VPA suffixes |
| GET `/accounts` · POST `/accounts` | Linked bank accounts |
| GET `/accounts/:id/balance` | **Live from the bank, cached nowhere** |
| GET `/directory/resolve?key=` | Masked name + currency + institution. Auth, rate limited, logged. Never returns an account reference or user id. |
| GET `/directory/available?vpa=` | Availability, with the reason |
| GET/POST `/directory/keys` · POST `/:id/verify` · DELETE `/:id` | |
| GET `/fx/quote?from&to&amountMinor` | 60-second lock |
| POST `/transfers` | `{ toKey, sourceAccountId, sourceCurrency, destCurrency, sourceAmountMinor, quoteId?, note? }`. Idempotency-Key required. |
| GET `/transfers/:id` | Mobile polls until terminal |
| GET `/transactions` · `/contacts` · `/qr/receive` · `/qr/resolve` | |
| GET `/notifications` · `/unread-count` · POST `/:id/read` · `/read-all` | |
| GET `/settlement/positions` | What each bank owes; the switch's FX book |
| GET `/health` (public) | |

**Clearing postings for a cross-currency transfer (XCD → JMD):**
1. `DEBIT payer_bank_position(XCD)` / `CREDIT fx_liquidity(XCD)`
2. `DEBIT fx_liquidity(JMD)` / `CREDIT payee_bank_position(JMD)`

Both currency legs balance independently. Same-currency posts a single leg directly between the two banks. Position sign convention: `credits − debits`; negative means that bank owes the network.

---

# Bank Connector

```ts
// apps/api/src/banks/connector.ts
export interface BankConnector {
  verifyAccount(accountRef): Promise<VerifyAccountResponse>;
  getBalance(accountRef): Promise<BankBalanceResponse>;
  placeHold(input, idempotencyKey): Promise<HoldResponse>;
  confirmDebit(holdRef, idempotencyKey): Promise<ConfirmDebitResponse>;
  releaseHold(holdRef, idempotencyKey): Promise<{ released: true }>;
  postCredit(input, idempotencyKey): Promise<CreditResponse>;
  listOutstandingHolds(): Promise<OutstandingHold[]>;
}
```

The interface points **outward at banks** — that inversion is the architecture. `HttpBankConnector` talks to `apps/mock-bank`; a real bank is a drop-in implementation. It classifies every failure into `BankRefusedError` or `BankUnknownError` so callers cannot get that distinction wrong.

---

# Verification

```bash
bun test                # 145 tests, incl. the switch↔bank integration suite
bun run reconcile       # per-currency zero, caps, stalled transfers, stranded holds
bun run settle          # net member-bank positions to zero
bun run typecheck       # four workspaces
```

---

# Local environment note

**See [docs/RUNNING.md](docs/RUNNING.md) for the full machine-specific runbook.** The essentials:

Docker on this machine runs inside WSL2 Ubuntu (no Docker Desktop). The redis container maps to host port 6380 here (native WSL redis owns 6379).

**Run `bun test` through WSL on this machine** — Bun for Windows (≤1.3.14) hangs or segfaults in bun:test under postgres connection churn. Everything else runs fine on Windows.

**Before debugging any DB failure, check that WSL is alive:** `(Get-Process wsl).Count`. With no persistent `wsl.exe`, WSL tears down the distro ~10 s after the last command exits and takes dockerd with it.

---

# Explicitly Out of Scope

Real bank integration, real KYC, real OTP delivery, NFC, push notifications, WebSockets, fraud/AI monitoring, merchant payments, cards, fees, admin dashboard, biometrics, dark mode, collect/pull requests, autopay mandates. If any of these seem "quick to add," don't — flag it and continue.
