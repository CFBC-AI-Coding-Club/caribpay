# CaribPay — System Overview

A briefing document: what this app is, how it is built, and where the seams are. Written to be
handed to someone (or something) that has not seen the code and needs enough context to propose
changes.

---

## 1. What it is

CaribPay is a consumer mobile wallet for **instant, fee-free, cross-island money transfers in the
Caribbean**. A person in St. Kitts holding an EC$ (XCD) wallet sends money to a relative in Jamaica
who receives JMD, in seconds, with no fee and — the load-bearing claim — **without the money
routing through the US dollar**. Today intra-Caribbean payments hop through USD correspondent
banking, which adds cost, delay, and an external dependency.

Five currencies: **XCD, JMD, BBD, TTD, USD**. Recipients are identified by a shareable wallet
address (`CW-XXXX-XXXX-XXXX-XXXX`), a saved contact, or a scanned QR code.

**Status:** Phase 2 prototype for the CANTO Innovation Challenge 2026 (judged 26–27 Aug 2026).
Built by four students. It is not production, but the ledger and settlement design are meant to be
architecturally honest — the team has to defend them in live technical Q&A. There is **no real
CAPSS connection, no bank relationship, no KYC provider, no live users**; FX rates are plausible
seeded statics, and settlement is a mock provider behind a real interface.

## 2. What a user can do

| Flow | Detail |
|---|---|
| Sign up / log in | Email + password. Signup creates the user, one wallet in their home currency (derived from country code), and auto-verifies KYC (prototype shortcut; the field exists). |
| Home | All wallets with balances, plus a total converted to the home currency via FX. Pinned quick-send contacts. |
| Send | Pick recipient (contact / typed address / QR scan) → address lookup confirms the recipient's name before you commit → enter amount → live FX quote with a **60-second lock** → review → confirm. |
| Watch it settle | The transfer detail screen shows `initiated → pending_settlement → settled` (or `failed`) as a live timeline, polled every 2 s. Money leaving and money arriving are separate, observable events. |
| Receive | A signed QR payload (`caribpay://pay?...`, HMAC-SHA256 over every field) plus the raw address to copy. |
| History | Unified cursor-paginated feed across all wallets, plus per-wallet history; each row is viewer-relative (in/out, who the other party was). |
| Wallets | Open an additional wallet in any supported currency on demand. |
| Contacts | Save counterparties by address, with a pinned quick-send subset. |

Deliberately **out of scope** (do not propose these without a decision): real CAPSS/bank
integration, real KYC, NFC, push notifications, WebSockets, fraud/AI monitoring, merchant payments,
fees, admin dashboard, biometrics, dark mode.

## 3. Shape of the system

```
Expo / React Native app  ──HTTPS+JSON──►  Hono API (Bun)  ──►  Postgres 16   (ledger, source of truth)
  expo-router screens    ◄──TanStack────    routes/                │
  Zustand (auth, draft)      Query         services/          Redis 7 + BullMQ  (settlement queue)
  theme/ design tokens                     middleware/             │
                                                                   ▼
                                                        settlement-worker
                                                                   │
                                                        SettlementProvider (interface)
                                                          └ MockCapssProvider  → future: real CAPSS
```

Bun workspaces monorepo:

- `apps/api` — Bun + Hono + Drizzle ORM. Routes are thin; logic lives in `services/`
  (`ledger`, `transfers`, `fx`, `wallets`, `contacts`, `qr`, `feed`, `counterparties`).
  `settlement/` holds the provider interface and mock. `workers/` holds the BullMQ consumer.
  Middleware: request-id, auth, idempotency, central error handler.
- `apps/mobile` — Expo SDK 54, expo-router file routes under `app/`, a typed fetch client and
  TanStack Query hooks under `src/api/`, Zustand for auth + send-draft state, and a design system
  under `src/theme/` (tokens, layout, type) with a `src/components/ui/` kit.
- `packages/shared` — **the contract.** Zod schemas per resource, currency math, constants. The API
  validates with them; the mobile client parses responses with them. A shape is never defined twice.

Local dev: Docker Compose runs only postgres + redis; the API runs on the host under Bun.
Deploy target is an Ubuntu VPS with pm2 + Caddy, GitHub Actions CI.

## 4. How money actually moves

This is the part that matters most, and the part any proposed change must not break.

**Data model.** `users`, `wallets` (one per user per currency, unique on user+currency),
`system_accounts` (`fx_liquidity | settlement_clearing | fee_revenue`, one per currency, seeded),
`transactions` (one row per logical movement, with status and idempotency key),
`ledger_entries` (double-entry postings), `wallet_balances` (a rebuildable cache),
`fx_rates`, `idempotency_records`, `refresh_tokens`.

**Four invariants:**

1. **All money is integers in minor units.** No floats anywhere. All arithmetic and formatting
   lives in `packages/shared/currency.ts`.
2. **The ledger is append-only.** A Postgres trigger raises on UPDATE/DELETE of `ledger_entries`.
   Balances are *derived*; `wallet_balances` is a cache updated in the same DB transaction as the
   entries, and `bun run reconcile` recomputes every balance from entries and diffs it.
3. **Per transaction, per currency, debits = credits.** Enforced in `postLedgerEntries` before
   insertion; a mismatch throws. Currency of each entry is checked against the account it posts to.
4. **Every money-moving endpoint requires an `Idempotency-Key`**, persisted with the response, and
   replayed verbatim on duplicates.

**The transfer lifecycle** (`services/transfers.ts` + `workers/settlement.ts`):

```
POST /transfers  (Idempotency-Key required)
  ├─ resolve recipient by wallet address; reject mismatched dest currency, self-transfer
  ├─ price it: same-currency → 1:1; else use the locked quote (410 if expired) or latest rate
  └─ in ONE DB transaction:
       insert transaction (initiated)
       SELECT ... FOR UPDATE on the balance row, reject if insufficient
       post the sender leg:  DEBIT sender wallet  /  CREDIT hold account   (source currency)
       flip status → pending_settlement
  └─ enqueue a BullMQ settlement job

settlement-worker
  ├─ provider.submit() → providerRef, then poll every 250 ms (60 s deadline)
  │    MockCapssProvider settles after a random 2–5 s (env-configurable), with an optional
  │    2% failure rate (off by default for demos)
  ├─ settled → in ONE DB transaction (row locked FOR UPDATE, no-op unless still pending):
  │              DEBIT hold account / CREDIT recipient wallet  (dest currency)
  │              flip status → settled, stamp settled_at
  └─ failed  → reverse the hold back to the sender wallet, flip → failed with a reason
```

The "hold account" is `fx_liquidity` for cross-currency transfers and `settlement_clearing` for
same-currency ones. **Each currency leg balances independently** — that is the answer to "how is a
cross-currency transfer not a float?" Cross-currency posts two legs (XCD leg, JMD leg);
same-currency posts one.

**FX:** static seeded rates in `fx_rates`, latest row per pair, XCD pegged to USD at 2.70 with
crosses derived. No external API calls. `GET /fx/quote` returns a rate + dest amount + a 60-second
expiry; the quote id is passed to `POST /transfers` and re-validated there.

## 5. API surface (`/api/v1`)

Bearer access token unless marked public. Errors always come back as `{ error: { code, message } }`
from a central handler; stack traces never leak.

```
POST /auth/register  (public)    POST /auth/login  (public)
POST /auth/refresh   (public)    POST /auth/logout
GET  /me
GET  /wallets                    POST /wallets
GET  /wallets/lookup?address=    GET  /wallets/:id/transactions   (cursor paginated)
GET  /fx/quote?from&to&amountMinor
POST /transfers  (Idempotency-Key)   GET /transfers/:id           (mobile polls, 2 s)
GET  /transactions               (unified cursor-paginated feed)
GET  /contacts                   POST /contacts
GET  /qr/receive                 GET  /qr/resolve
GET  /health     (public — db + redis)
```

Auth is JWT access (15 min) + rotating refresh tokens (30 d); passwords via `Bun.password`
(argon2id). Tokens live in `expo-secure-store` on device.

## 6. Frontend conventions

- **expo-router** file routes: `(tabs)/` for home, activity, contacts, menu; then `send/`,
  `transfer/[id]`, `transaction/[id]`, `wallet/[id]`, `wallet/add`, `receive`, `scan`,
  `contact/add`, `login`, `register`, `welcome`, `profile`.
- **TanStack Query owns server state** (all reads, plus mutations that invalidate wallets /
  transactions / contacts). **Zustand owns client state only** — the auth session and the in-flight
  send draft. Do not cache server data in Zustand.
- **The design system is the single source of visual truth.** `src/theme/` (tokens, layout, type)
  and `src/components/ui/` implement a 28-screen Claude Design board; `DESIGN.md` documents it.
  No hardcoded hex or px in screens.
- **Voice and honesty rules** (from `PRODUCT.md`): state what will happen, what it costs, and what
  has already happened. Never imply money moved before it did; never imply money was lost when a
  hold was reversed. Status is never conveyed by colour alone — always an icon plus a label.
- Accessibility currently held to: 4.5:1 text contrast, 44×44pt targets spaced ≥8pt, no type below
  11pt. Not yet done: dynamic type, landscape/tablet, screen-reader passes on money flows.

## 7. Engineering rules a change must respect

1. TypeScript strict everywhere; no `any` without an inline justification.
2. Money = integers in minor units, arithmetic only in `packages/shared/currency.ts`.
3. Every request/response shape is a Zod schema in `packages/shared`, used by both sides.
4. The ledger is append-only; balances stay reconcilable from entries.
5. Money-moving endpoints require a persisted idempotency key with replayed responses.
6. One central error handler, one error envelope.
7. Conventional commits, one commit per completed sub-task.
8. **Boring, readable code beats clever code** — four students maintain this under deadline.

## 8. What exists as evidence

- Working end-to-end money movement: cross-currency transfer, async settlement, reversal on
  failure, and `bun run reconcile` proving cached balances match the append-only entries.
- Seeded demo data (`bun run db:seed:demo`): four users across St. Kitts, Jamaica, Barbados,
  Trinidad with balances, history, and contacts. The St. Kitts → Jamaica pair is the cross-currency
  demo. Documented in `DEMO.md`.
- Test suite (`apps/api/test/`, `packages/shared/test/`): currency math, the ledger balance
  invariant, auth, idempotency, settlement success and failure, wallets/FX, contacts/QR/feed
  pagination.

## 9. Known soft spots — reasonable places to suggest changes

- **`MockCapssProvider` keeps in-flight state in memory**, so `poll()` must run in the process that
  called `submit()`. Fine for the single worker; a restart mid-flight means BullMQ retries and
  re-submits from scratch. A multi-process worker fleet would need durable provider state.
- **The worker busy-polls** every 250 ms up to a 60 s deadline inside the job, holding a worker slot
  (concurrency 5) for the whole 2–5 s settlement. A delayed-job re-check pattern would scale better.
- **Status is polled, not pushed** — 2 s TanStack Query interval on the transfer detail. WebSockets
  are explicitly out of scope for this phase.
- **`wallet_balances` is the enforcement point for overdrafts** (a `wallet_balances_non_negative`
  CHECK plus a `FOR UPDATE` read), which means the cache is load-bearing for correctness, not purely
  an optimisation. Worth knowing before touching it.
- **No fees, no `fee_revenue` postings yet**, though the account type is seeded.
- **KYC is auto-verified**, and the recipient's dest currency must exactly match an existing
  recipient wallet — there is no auto-open-wallet-on-receive.
- **Open product decision:** which parts the student team carries forward vs. what a production
  build replaces has not been decided. Where prototype and shippable product diverge, record the
  divergence rather than silently picking one.

## 10. Local dev, briefly

```
docker compose up -d          # postgres + redis only
bun run db:migrate            # drizzle-kit migrations
bun run db:seed               # system accounts + fx rates
bun run db:seed:demo          # four demo users with history
bun run dev:api               # Hono on the host under Bun
bun run dev:mobile            # Expo / Metro
bun run reconcile             # recompute balances from ledger entries and diff
bun test                      # api + shared test suites
```

Machine-specific quirks (Docker inside WSL2, redis on host port 6380, running `bun test` through
WSL) are documented in `RUNNING.md` and are not properties of the project.
