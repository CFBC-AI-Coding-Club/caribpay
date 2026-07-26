# CaribPay — System Overview

A briefing document: what this is, how it works, and where the seams are. Written to be handed to
someone who has not seen the code and needs enough context to propose changes.

---

## 1. What it is

CaribPay is a **payment switch** for the Caribbean — the messaging and clearing layer between member
banks, in the mould of UPI and PAPSS. It is deliberately **not a wallet**.

A person sends money to `devon@caribpay` and it arrives in Devon's account at NCB Jamaica seconds
later, in JMD, having come from an XCD account in St. Kitts without routing through the US dollar and
without a fee. CaribPay never holds the money at any point in that.

Five currencies: **XCD, JMD, BBD, TTD, USD**.

**Status:** Phase 2 prototype for the CANTO Innovation Challenge 2026. Built by four students. Every
member bank is **simulated** — there is no real bank relationship, no regulatory approval, no live
users. FX rates are plausible seeded statics.

## 2. Why the architecture is the pitch

```
   Payer's bank                                   Payee's bank
   (holds the money)                              (holds the money)
        │                                               ▲
        │  1. hold request                              │  2. credit instruction
        ▼                                               │
   ┌──────────────────────────────────────────────────────────┐
   │                    CaribPay Switch                       │
   │   directory (address → account) · FX · clearing ledger   │
   │              net settlement between member banks         │
   └──────────────────────────────────────────────────────────┘
```

A transfer is a conversation, not a movement of our money:

1. The payer's app submits an instruction against an address.
2. The switch resolves the address to a member bank and an account reference.
3. It asks the **payer's bank** to place a hold. The bank checks funds and answers.
4. It asks the **payee's bank** to credit. The bank credits and answers.
5. It confirms the hold as a settled debit at the payer's bank.
6. If step 4 fails, it releases the hold. The payer is made whole by their own bank.

**We are a payment initiation and clearing operator, not an e-money issuer.** No customer funds, no
safeguarding account, no float, and a materially lighter regulatory ask than a stored-value wallet
would carry. This is the same reason NPCI could scale UPI without being a bank.

That claim is verifiable, not asserted: **the switch's database contains no column holding a customer
balance**, and a test fails if one is ever added.

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name ILIKE '%balance%';
-- returns nothing
```

## 3. Shape of the system

```
Expo / React Native  ──HTTPS──►  apps/api  (the switch)      ──HTTP──►  apps/mock-bank
  expo-router                     directory · FX · clearing              accounts · holds
  TanStack Query                  saga worker · recovery sweeper         debits · credits
  Zustand (auth, draft)                 │                                      │
                                        ▼                                      ▼
                              caribpay (Postgres)                    caribpay_bank (Postgres)
                              + Redis (BullMQ, quotes, rate limits)
```

Bun workspaces monorepo:

- **`apps/api`** — the switch. Hono + Drizzle. `services/` holds directory, accounts, transfers,
  clearing, notifications; `banks/` holds the connector; `settlement/` holds the netting engine;
  `workers/` holds the saga worker and the recovery sweeper.
- **`apps/mock-bank`** — the simulated member banks. Its own database, which `apps/api` has no
  credentials for. The boundary is the point: it makes "we hold no funds" inspectable.
- **`apps/mobile`** — Expo SDK 54, expo-router.
- **`packages/shared`** — the contract. Zod schemas, VPA logic, currency math, the institution list.
  Used by all three, so a shape is never defined twice — including across the network boundary.

## 4. Addressing: the directory

`identifier@psp` — `amara@caribpay`. The suffix is a **PSP handle**, not our brand, so a real bank can
own `@ncb` later without a migration. Twenty-one regional institutions are seeded; only `caribpay` is
an active PSP, every bank is `planned`, so nobody can register `someone@sknanb` and imply a
relationship we do not have.

A directory key points at exactly one linked bank account. Keys may be a VPA, a phone number, or an
email.

Four rules do the safety work:

- **Confusable rejection.** A skeleton collapses lookalikes (`0`→`o`, `1`/`l`→`i`, `5`→`s`, `rn`→`m`,
  separators stripped). `fra1mer` cannot be registered while `fraimer` exists.
- **Reserved words.** Institution handles, flattened display names, curated aliases, and support/
  governance terms — matched exactly, on skeletons. Substring matching was rejected: it denies
  `ncbryan` for no security gain.
- **Never recycled.** Uniqueness on value and skeleton is global, covering released rows. A handle is
  spent once. In an instant, irreversible system a recycled address means money reaching a stranger.
- **Masked names only.** `GET /directory/resolve` returns "Devon C.", the currency, and the
  institution — never the account reference, the user id, or their other keys. It is authenticated,
  rate limited (20/user/min), and every lookup is logged.

## 5. The transfer saga

```
initiated → debit_pending → debit_held → credit_pending → completed
                    ↘ failed                    ↘ reversal_pending → reversed
```

`driveTransfer()` is one resumable function, shared by the worker and the recovery sweeper, safe to
call at any point. Three properties make it work:

**Deterministic step keys.** Every instruction to a bank is keyed `${transactionId}:${step}`, derived
and never generated. A retry after a timeout reuses the key, so the bank replays its original answer
rather than placing a second hold.

**A refusal is actionable; an unknown is not.** `BankRefusedError` means the bank says it did not
happen — safe to fail or reverse. A timeout or 5xx means we do not know, and reversing on an unknown
credit would leave the switch short. Because replay is safe, re-sending the instruction is
simultaneously the question and the fix, which is why no lookup endpoint is needed.

**Recovery drives forward, never back.** Past the credit the money has irrevocably reached the payee.
The sweeper finds transfers stalled past their deadline and finishes them. Holds also carry an expiry
at the bank, so even total switch failure self-heals.

## 6. The clearing ledger

Append-only, enforced by a Postgres trigger. It now accounts for **inter-bank positions**, not
customer balances — so every entry is a system-account entry, and the wallet-era discriminator,
balance cache and overdraft path are all gone.

Sign convention: `position = credits − debits`. Negative means that bank owes the network.

- **Same currency:** `DEBIT payer_bank_position` / `CREDIT payee_bank_position`.
- **Cross currency:** two legs that balance independently within their own currency, with the
  switch's FX book between them. That is what makes XCD → JMD a single regional movement rather than
  two hops through USD.

Invariants: money is integers in minor units, arithmetic only in `packages/shared/currency.ts`;
debits equal credits per transaction per currency; entry currency is checked against its account.

**Net settlement** (`bun run settle`) computes each bank's position, posts entries returning them to
zero against `settlement_clearing`, and records a cycle. The credit to a payee is instant and
irrevocable; settlement between banks is deferred and netted — one instruction replaces every
transfer in the window.

**Prefunded caps** bound the intraday risk. A transfer that would push the payer's bank past its cap
is declined *before any hold is placed*.

## 7. What `reconcile` proves

Four checks, in ascending order of what they can tell you:

1. Per-currency net zero — trivially true given the posting invariant; kept as a regression guard.
2. **Positions against caps** — the real intraday exposure.
3. **Transfers stalled mid-saga** past their deadline.
4. **Stranded holds**, asked of the banks over the network rather than of our own tables. A hold we
   have forgotten is exactly the one our tables cannot show us.

## 8. API surface (`/api/v1`)

```
POST /auth/register|login|refresh|logout        GET  /me
GET  /institutions
GET  /accounts        POST /accounts            GET  /accounts/:id/balance   (live, uncached)
GET  /directory/resolve?key=                    GET  /directory/available?vpa=
GET  /directory/keys  POST /directory/keys      POST /directory/keys/:id/verify
DELETE /directory/keys/:id
GET  /fx/quote?from&to&amountMinor
POST /transfers  (Idempotency-Key)              GET  /transfers/:id
GET  /transactions                              GET  /contacts   POST /contacts
GET  /notifications   GET /notifications/unread-count
POST /notifications/:id/read  POST /notifications/read-all
GET  /settlement/positions                      GET  /qr/receive  GET /qr/resolve
GET  /health
```

Errors use one envelope, `{ error: { code, message } }`. Money-moving endpoints require an
`Idempotency-Key`, **claimed by insert before the handler runs** — reading for an existing record and
then acting is a race that lets concurrent retries all execute.

## 9. Mobile

Send is a four-step flow: **recipient → confirm → amount → review**. The confirmation showing a
resolved masked name sits before the amount deliberately; paying the wrong person is the failure this
product cannot take back. Contacts, scanned QR codes and "send again" all route through that same
confirmation, because a saved row, a signed payload and an old receipt are none of them substitutes
for asking the directory who an address currently reaches.

Balances are read live per account, one query each, so a card resolves at its own bank's speed. The
UI says "as reported by your bank just now" and means it.

The eight saga states map onto three the payer needs: **Held at your bank → Clearing → Delivered**.
"Held" is the honest word — reserved, not sent, released in full if the credit fails.

Institution names appear without in-app disclaimers: the notice was repeated on five screens and
read as a defect rather than a disclosure. The simulation is disclosed in `DEMO.md`, in the
institutions seed header, and verbally when presenting.

## 10. Known soft spots

- **The mock bank simulates all institutions from one service.** `connectorForInstitution` ignores the
  handle and returns one HTTP connector. A real bank arrives as a different implementation keyed by
  the same handle — the seam exists, but it has one implementation behind it.
- **OTP verification is auto-approved** for phone and email keys, marked `TODO(prod)`. The flow exists
  end to end so the question has an answer.
- **The FX book never settles.** It accumulates a long/short position by design, reported by
  `reconcile` and `settle`. There is no counterparty modelled to clear it against.
- **Notifications are polled**, 5 s while foregrounded. Only the unread *count* is polled; an actual
  arrival triggers the refresh. WebSockets and push are out of scope.
- **Contacts resolve their address on every read**, which is N queries for N contacts.
- **The recovery sweeper is single-instance.** Two API processes would both sweep; the work is
  idempotent, so this is wasteful rather than wrong.
- **Migrations are a single baseline.** The switch pivot dropped the wallet model destructively, so
  there is no path forward from a wallet-era database — drop and recreate.

## 11. Local development

```
docker compose up -d
bun run db:migrate            bun run db:migrate:bank
bun run db:seed:demo -- --reset
bun run db:seed:bank
bun run dev:bank              # simulated banks  :3100
bun run dev:api               # the switch       :3000
bun run dev:mobile            # Expo / Metro
bun run settle                # net the positions
bun run reconcile             # prove the books
bun test                      # 138 tests
```

Machine-specific quirks (Docker in WSL2, redis on 6380, running `bun test` through WSL) are in
`RUNNING.md` and are not properties of the project.
