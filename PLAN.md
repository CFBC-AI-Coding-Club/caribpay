# Implementation Plan v2 — Overlay Switch Architecture

Status: **approved 26 July 2026.** Supersedes plan v1; surviving v1 analysis is carried forward in
Part 0. Decisions taken in review are recorded in Part 10.

Fallback secured before any of this begins: `v0.1.0-wallet-demo` tags the working wallet prototype,
and `deploy/fallback.md` stands it up on an isolated database, Redis index and port.

Read against: `OVERVIEW.md`, `PRODUCT.md`, `DESIGN.md`, `DEMO.md`, `RUNNING.md`, plan v1,
`packages/shared/`, all of `apps/api/src/`, the five migrations, both seeds, `reconcile.ts`,
`apps/api/test/helpers.ts`, `docker-compose.yml`, `ecosystem.config.cjs`, `.github/workflows/ci.yml`.

---

## Progress

| Phase | State | Commit |
|---|---|---|
| 2 · shared contracts | **done** — 47 tests | `110bc1b` |
| 1 · `apps/mock-bank` | **done** — 23 tests | `5febb5a` |
| 3 · api: drop wallets, directory, connector | next | — |
| 4–10 | not started | — |

Tree is green at `5febb5a`: 154 tests, four workspaces typecheck, `reconcile` clean, and the
existing St Kitts → Jamaica wallet demo still runs. **Phase 3 opens with the destructive migration,
so it should be started only with room to finish it** — a half-dropped `wallets` table with a
half-rewritten transfer service is the one state this plan exists to avoid.

Two findings from the work so far that change later phases:

- **`apps/api/src/middleware/idempotency.ts` has a check-then-act race.** It reads for an existing
  record and then proceeds, so concurrent retries of one instruction all execute. The identical bug
  in the mock bank placed three holds for ten concurrent retries of one hold. Fix it in phase 3 with
  the same claim-by-insert pattern (`apps/mock-bank/src/middleware/idempotency.ts`), together with
  the `response_body` NOT NULL issue from v1 §1.9 — both need one migration.
- **Institution data lives in `packages/shared/src/institutions-data.ts`**, not the API seed folder
  as v1 specified, because both services seed from it.

## Part 0 — Carried forward from plan v1

Still true, still planned, not repeated below:

- **§1.3 The auto-minted VPA must be infallible** — signup runs in one transaction; a mint that can
  throw can fail a registration. Neutral mint (`cp-<8 chars>@caribpay`) makes this easy, but the
  fallback chain still gets built and tested.
- **§1.5 Contacts must move off wallet addresses** — now doubly true, since `wallets` is deleted.
  `contact_user_id` is the durable link; store `saved_key`, resolve the live primary VPA on read.
- **§1.7 Enum values cannot be used in the transaction that adds them** — applies to the new
  `transaction_status` values and the `system_account_type` change.
- **§1.8 Two hardcoded table lists** (`truncateAll`, `DATA_TABLES`) must be updated for every table
  added or dropped. Worse now: there are two services and two databases.
- **§1.9 `idempotency_records.response_body` is `notNull()` but the middleware inserts `null`** for
  empty bodies. Latent; fix while we are in there.
- **`maskName()` in shared with unit tests**; `is_primary` enforced by a partial unique index, not
  service logic; released keys excluded from the five-key cap.

Resolved by the v2 prompt and no longer open: v1 §1.1 (phone), §1.2 (transfer body), §1.4 and the
`supportedCurrencies` note (deleted with wallets), §1.6 (`topup` deleted), §1.10 reserved rules.

---

## Part 1 — Things in the v2 spec I think are wrong or risky

The first three are correctness issues that will cost us the demo if they are discovered in week
three instead of designed in week one. §1.9 is about scope and is the one I most want an answer on.

### 1.1 BLOCKER — idempotency keys across the network boundary must be deterministic

The spec says every mock-bank endpoint requires an idempotency key and replays on duplicates. It does
not say where the key comes from. If `BankConnector` mints a fresh key per attempt, a retry after a
timeout places a **second hold** — the exact double-spend the whole design exists to prevent, and the
same bug class we just fixed in the mobile client.

**Requirement:** keys are derived, never random, and derived from data that is already durable:

```
`${transactionId}:hold`      `${transactionId}:credit`
`${transactionId}:confirm`   `${transactionId}:release`
```

BullMQ retries, process restarts, and manual replays then all collapse onto the same key. This is the
single most important line of code in the system and it should be a pure function in
`packages/shared` with its own test.

### 1.2 BLOCKER — a timeout is not a failure, and must never trigger a release

If `POST /credits` times out we do not know whether the payee was credited. Treating that as failure
and releasing the payer's hold produces the worst possible outcome: **payee credited, payer refunded,
the switch short the money.**

**Requirement:** on timeout or connection error, the connector re-sends the *identical* request with
the *identical* idempotency key. Because the mock bank replays on duplicates, the response is
authoritative: if the credit landed we get the original result back; if it never arrived it executes
now. Only an explicit, non-ambiguous refusal (`ACCOUNT_CLOSED`, `INSUFFICIENT_FUNDS`) may trigger the
reversal path.

Pleasingly, this needs **no extra endpoint** — it falls out of idempotent replay. But it must be the
connector's default retry semantics, not something each caller remembers.

### 1.3 BLOCKER — the saga has a crash window that must complete forward, not roll back

Between "payee's bank confirms the credit" and "we post clearing entries and flip to `completed`"
there is a window. A crash there leaves: payee credited (irrevocable), payer's hold outstanding,
nothing in the clearing ledger, transfer stuck in `credit_pending`.

Rolling back is impossible — the credit is irrevocable by design. The only correct recovery is to
**complete forward**: confirm the hold, post the entries, flip to `completed`.

**Requirement:** a recovery sweeper (`workers/recovery.ts`, run on an interval and on boot) that
finds transfers stuck in non-terminal states past a deadline and drives them to a terminal state by
re-asking the banks what actually happened. This is the difference between a demo that survives a
laptop lid closing and one that does not. It is roughly a day of work and it is not optional.

The spec's "the release path must be retried to exhaustion and alerted on, never dead-lettered
silently" is the same instinct — I am asking to generalise it to every non-terminal state, not just
releases.

### 1.4 Deleting `wallets` is a destructive migration — all existing history dies

`ledger_entries.wallet_id` is a FK to `wallets`, and the `ledger_entries_account_ref` check
constraint references `'user_wallet'`. Dropping `wallets` means dropping every existing ledger entry,
which means every existing transaction's postings, which means the seeded demo history.

There is no meaningful migration path — the old rows describe balances we are asserting we never
held. **The migration truncates and the world is reseeded.** Fine for a prototype, but it should be a
decision rather than a surprise, and `db:seed:demo --reset` becomes mandatory after deploy.

### 1.5 Good news: the ledger gets *simpler*

Worth stating because it affects the plan. With no customer balances, **every ledger entry is a
system-account entry**. So:

- `ledger_account_type` enum (`user_wallet | system`) can be dropped entirely.
- `ledger_entries.wallet_id` dropped; `system_account_id` becomes `NOT NULL`.
- The two-branch `ledger_entries_account_ref` check disappears.
- `postLedgerEntries` loses its wallet-balance-cache half — the `update`-first dance, the
  `wallet_balances_non_negative` catch, the `InsufficientBalanceError` path. Overdraft is the payer
  bank's answer now.

`postLedgerEntries` goes from ~125 lines to maybe 60, and its invariant test gets stronger, not
weaker. This is the one place where v2 is less work than v1.

### 1.6 `fx_liquidity` is now a real FX book that never nets to zero

Under the cross-currency posting, `fx_liquidity` accumulates a long XCD position and a short JMD
position that the netting cycle does not clear — the two legs balance *within their own currency*, so
the per-currency invariant holds trivially, but the account itself carries a growing exposure.

That is a truthful representation of running an FX book, and it is a good answer if we have one
ready. It is a bad look if a judge finds it first.

**Decided:** seed `fx_liquidity` with an explicit opening position per currency, and have
`bun run settle` print the switch's FX exposure as its own line. Then "who carries the FX risk" has
an answer on screen: we do, and here is the number.

Size the opening position **large enough that demo transfers read as small against the book**. An
exposure line that looks like unbounded accumulation invites a worse follow-up than one that looks
like a managed position — and the managed reading is where the tourist hard-currency inflow thesis
becomes the answer rather than an excuse.

Note also that `reconcile`'s "every currency nets to zero" is *trivially* true given the
`postLedgerEntries` invariant — it can never fail. The check with teeth is **per-account positions
against caps**, and **derived positions matching the recorded settlement cycles**. I will build
those, and keep the per-currency assertion as a cheap regression guard.

### 1.7 A new user cannot receive money until they link a bank account

Their auto-minted VPA points at nothing. This is inherent to the model (it is true of UPI too), but
it changes onboarding: sign up → link account → *then* you have an address that works. `resolve` on
an unlinked VPA needs a distinct error, and the Receive screen needs a real empty state rather than a
broken QR.

Flagging because the demo script's first act now has an extra step, and because "a VPA that resolves
to nothing" is the kind of thing that gets discovered on stage.

### 1.8 Live balances will make the home screen slow

`GET /accounts/:id/balance` proxies to the bank with no cache, at 300–1200 ms of configured latency,
per account. Three linked accounts done sequentially is up to 3.6 s of spinner on the screen judges
look at most.

**Recommendation:** fetch per-account in parallel with independent TanStack Query keys so each card
resolves on its own; render the account list instantly from our own data and let balances land
underneath; keep the "as reported by your bank just now" line the spec asks for, plus a timestamp.
Also make sure the 5 s notification poll does **not** invalidate balances — only an actual arrival
does, or we will hammer the mock bank continuously.

### 1.9 Scope: this is materially bigger than v1, and v1 was already tight

I estimated v1 at 14–16 focused days. v2 keeps almost all of v1's directory work, **adds** a second
application with its own database and test suite, a two-phase-commit saga across a network boundary
with a recovery sweeper, a netting engine, and prefunded caps — and **deletes and rebuilds the spine
of the existing app**: 15 API source files, all 5 API test files, 24 mobile files, 7 shared files.

Honest estimate for the full spec: **25–32 focused working days.** Today is 26 July. Judging is 26–27
August. Four students, wanting rehearsal time.

I am not going to tell you it fits, because I do not think it does at full scope.

**Resolved in review, and the calendar is worse than the estimate assumed.** 26 July → 26 August is
not continuous: the Youth Summit runs 10–14 August and you are Operations Manager, so 8–16 August is
gone once prep and teardown are counted. Real availability is **~2 weeks, a 9-day hole, then ~1.5
weeks.**

That dictates a shape rather than merely arguing for one:

- **Phases 1–4 must be finished before 8 August.** The destructive migration and the saga are the
  only work here that cannot survive being half-done across an interruption. Returning on 17 August
  to a partially-rewritten transfer service with `wallets` already dropped is the scenario that loses
  the demo.
- **Phases 5 and 6 are spine, not a second tier.** §1.9's own argument — that they cannot be cut —
  means they are not a layer. A switch with a rough mobile surface and a working `bun run settle`
  demonstrates the thesis; a polished app that cannot show netting does not.

**Spine = 1, 2, 3, 4, 5, 6, minimal 7, 9 ≈ 19.5 days.** Genuinely cuttable: mobile depth,
notifications, docs polish.

**Parallelisation.** Phases 3–6 share the ledger and must run sequentially, but two tracks split off
cleanly:

| Track | Work | Depends on |
|---|---|---|
| A (two strongest) | 3 → 4 → 5 → 6 sequentially | phase 2 types |
| B | phase 1 `apps/mock-bank`, then phase 9 seeds | nothing |
| C | phase 7 mobile, scaffolded against phase 2's Zod types before the API exists | phase 2 |

Phase 2 is therefore the true critical path — it unblocks all three tracks and should be done first
and fast, by one person, in a day and a half.

### 1.10 Cross-currency is off the cut list entirely — confirmed

Your cut line ends with "cross-currency FX legs (keep same-currency)". Cross-currency **is** the
positioning — `PRODUCT.md` puts "no US dollar is in the route" among the two load-bearing claims, and
the XCD → JMD pair is the entire demo. A same-currency-only switch is a domestic ACH clone.

**Cut order:** notifications polish → settlement *screen* (keep the CLI) → prefunded caps →
phone/email directory keys (VPA only) → mobile depth on the key-management screen. Never cut:
cross-currency, the reversal path, the recovery sweeper.

There is also almost nothing to save by cutting cross-currency: it is the same hold/credit sequence
with two ledger legs instead of one, against an FX quote service that already exists. All of the
risk, none of the savings.

### 1.11 Smaller notes

- **`directory_keys.linked_account_id` should be nullable**, falling back to the user's `is_default`
  linked account. Otherwise closing an account orphans every key pointing at it and the user silently
  becomes unpayable. Nullable + default is how UPI behaves.
- **The mock bank needs `GET /holds?status=outstanding`** for `reconcile` to assert no stranded
  holds. That is the one endpoint missing from the spec's list.
- **Hold expiry needs a sweeper in the mock bank** (or lazy evaluation on read) or "a hold expiring
  without confirmation self-releases" cannot be tested.
- **Eight transaction states vs. a three-step Timeline.** `DESIGN.md`'s Settlement Timeline is a
  signature component with three markers. Recommend mapping the eight internal states onto three
  user-facing steps (Sent → Clearing → Delivered, with Reversed as the failure branch) so the
  component survives. Internal states stay visible on the transaction detail screen for judges.
- **`ledger_entries_amount_positive` and the append-only trigger** must be preserved through the
  destructive migration. Easy to lose when a table is rebuilt.
- **`transaction_type`**: `deposit`, `withdrawal` and `fx_conversion` become unused once funding is
  deleted. Leave the enum alone (removing values is painful) but stop writing them.
- **Two databases on one Postgres instance.** `caribpay` and `caribpay_bank`, with a separate role
  for the bank DB that has no grant on `caribpay`. That makes "impossible by connection
  configuration" literally true and testable. Needs `docker-compose.yml` init SQL, a second
  `DATABASE_URL`, CI service config, a third pm2 process, and a `RUNNING.md` rewrite.
- **`DEMO.md` is already stale** (documents SDK 57 + dev build; tree is SDK 54 + Expo Go).

---

## Part 2 — What gets deleted

| Area | Deleted |
|---|---|
| DB | `wallets`, `wallet_balances`, `wallet_balances_non_negative`, `ledger_entries.wallet_id`, `ledger_account_type` enum, `ledger_entries_account_ref` check |
| API | `services/wallets.ts`, `routes/wallets.ts`, wallet CRUD, `lookupAddress`, the balance-cache half of `services/ledger.ts`, `InsufficientBalanceError`, `assertSufficientBalance` |
| Settlement | `settlement/provider.ts`, `settlement/mock-capss.ts` → replaced by `banks/connector.ts`, `banks/http-connector.ts`. **No file, type, comment or test may say CAPSS.** |
| Shared | `schemas/wallets.ts`, `WALLET_ADDRESS_PATTERN` and the `CW-` generator, wallet fields on contact/QR/transaction schemas |
| Mobile | `app/wallet/[id].tsx`, `app/wallet/add.tsx`, `useWallets`, `useCreateWallet`, the wallet picker in send and receive |
| Tests | `fundWalletForTest`, `testWalletAddress`, `wallets-fx.test.ts` (rewritten as `accounts-fx.test.ts`) |

Nothing behind a flag, per your instruction.

---

## Part 3 — Migrations

`apps/api` — the first is destructive and must run before anything else.

| # | File | Contents |
|---|---|---|
| 0005 | `drop_wallets` | Drop `ledger_entries` FK + check + `wallet_id`; `system_account_id` → `NOT NULL`; drop `ledger_account_type`; drop `wallet_balances`, `wallets`. Truncates history (§1.4). Preserves the append-only trigger and the positive-amount check. |
| 0006 | `add_institutions` | `institutions` incl. `psp_handle`, `psp_status`, `reserved_aliases text[]`, `sort_order`. |
| 0007 | `add_linked_accounts` | `linked_accounts`. **Asserted to contain no balance column.** |
| 0008 | `add_directory_keys` | `directory_key_type` enum, `directory_keys` with `linked_account_id` (nullable, §1.11), partial unique indexes on `value_normalized`, `skeleton`, and one-primary-per-user, all `WHERE released_at IS NULL`. |
| 0009 | `bank_positions` | `system_account_type` += `bank_position`; `system_accounts.institution_id` (nullable) + `debit_cap_minor`; unique index moves to `(type, currency, institution_id)`. No inserts (§0/v1 §1.7). |
| 0010 | `transfer_lifecycle` | `transaction_status` += `debit_pending, debit_held, credit_pending, completed, reversal_pending, reversed`; `transactions` gains `recipient_key_used`, `recipient_name_snapshot`, `payer_account_id`, `payee_account_id`, `hold_ref`, `debit_ref`, `credit_ref`, `deadline_at`. |
| 0011 | `settlement_cycles` | `settlement_cycles` + `settlement_cycle_entries`. |
| 0012 | `add_notifications` | `notification_type` enum, `notifications`, index on `(user_id, created_at desc)` and a partial unread index. |
| 0013 | `contacts_to_keys` | `saved_key` replaces `wallet_address`; unique index → `(owner_user_id, contact_user_id)`. |

`apps/mock-bank` — its own migration folder, own drizzle config: `accounts`, `holds`, `debits`,
`credits`, `bank_idempotency_records`.

---

## Part 4 — Shared package

**New:** `vpa.ts` (normalise, skeleton, parse key type, E.164, `maskName`), `reserved.ts`,
`idempotency.ts` (the deterministic step-key derivation from §1.1 — pure, tested),
`schemas/directory.ts`, `schemas/accounts.ts`, `schemas/institutions.ts`,
`schemas/notifications.ts`, `schemas/bank.ts` (the mock bank's wire contract, so both services parse
the same shapes — rule 6 applies across the boundary too).

**Changed:** `constants.ts` (VPA rules, key cap, PSP statuses, new transfer statuses; drop
`WALLET_ADDRESS_PATTERN`), `schemas/transfers.ts` (the v2 body), `schemas/transactions.ts` (statuses,
snapshot fields, counterparty by VPA), `schemas/qr.ts` (VPA payload, masked signed name),
`schemas/contacts.ts`. **Deleted:** `schemas/wallets.ts`.

Unit tests first, per your sequencing.

---

## Part 5 — Endpoints

**`apps/mock-bank`** — exactly the spec's list, plus `GET /holds?status=outstanding` (§1.11).
Every endpoint idempotent and replaying.

**`apps/api`** — `GET /institutions`; `GET|POST /accounts`, `DELETE /accounts/:id`,
`GET /accounts/:id/balance` (live proxy); `GET /directory/resolve|keys|available`,
`POST /directory/keys`, `POST /directory/keys/:id/verify`, `DELETE /directory/keys/:id`;
`POST /transfers`, `GET /transfers/:id`; `GET /settlement/positions`; `GET /notifications`,
`GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`;
`GET /qr/receive|resolve`. **Removed:** all `/wallets*`.

New services: `directory.ts`, `institutions.ts`, `accounts.ts`, `clearing.ts`, `settlement/netting.ts`,
`notifications.ts`, `banks/connector.ts`, `banks/http-connector.ts`. New workers: `transfer.ts`
(the saga), `recovery.ts` (§1.3). `services/transfers.ts` is rewritten around the state machine.

---

## Part 6 — Mobile

**Deleted:** `wallet/[id]`, `wallet/add`, wallet pickers.
**New:** `accounts/link.tsx`, `accounts/index.tsx`, `send/confirm.tsx`, `directory/keys.tsx`,
`directory/claim.tsx`, `settlement/positions.tsx` (cuttable per §1.10), `SimulatedNotice` in the UI
kit, an arrival banner.
**Reshaped:** `home.tsx` (the nocturne card now carries a *bank account* balance, live, with a "as
reported by your bank just now" line — this is the biggest single design change, since `DESIGN.md`'s
signature component is specified around wallets), `send/index.tsx`, `receive.tsx`, `scan.tsx`,
`transfer/[id].tsx` (8 states → 3 Timeline steps, §1.11), `transaction/[id].tsx`, `contacts.tsx`,
`contact/add.tsx`, `activity.tsx`, `profile.tsx`, `_layout.tsx`.

Every screen naming a real institution renders `<SimulatedNotice />` — a real token-styled component,
also disclosed in `DEMO.md` and at the head of the institutions seed.

---

## Part 7 — Infrastructure

`docker-compose.yml` gains an init script creating `caribpay_bank` and a `bankuser` role with no
grant on `caribpay`. `ecosystem.config.cjs` gains a `caribpay-mock-bank` process. CI gains the second
database, a second migrate step, and the mock-bank test suite. `RUNNING.md` gains a fourth terminal.
Root `package.json` gains `dev:bank`, `settle`, and bank migrate/seed scripts.

---

## Part 8 — Sequencing against the calendar

Availability: **27 July – 7 August** (~2 weeks), **8–16 August gone** (Youth Summit), **17–25 August**
(~1.5 weeks), judging **26–27 August**.

| Phase | Work | Est. | Track | Deadline |
|---|---|---|---|---|
| 2 | shared: directory, VPA, skeletons, reserved, **deterministic step keys**, schemas | 1.5 d | — | **29 Jul** — critical path, unblocks A and C |
| 1 | `apps/mock-bank`: service, schema, endpoints, idempotency, seeds, tests | 3 d | B | 1 Aug |
| 3 | api: destructive migration, delete wallets, institutions/keys/accounts, directory service, connector | 3.5 d | A | 3 Aug |
| 4 | transfer saga + worker + **recovery sweeper**, every branch tested | 4 d | A | **7 Aug — hard stop** |
| 5 | clearing ledger on bank positions, caps, extend reconcile | 2 d | A | 19 Aug |
| 6 | netting cycle, `bun run settle`, positions endpoint | 2 d | A | 21 Aug |
| 7 | mobile: link, live balance, send, receive, QR, keys | 4 d | C | 22 Aug |
| 9 | seeds and demo data across both services, `SimulatedNotice` | 1.5 d | B | 23 Aug |
| 8 | notifications, api + mobile | 1.5 d | cuttable | 24 Aug |
| 10 | docs rewrite incl. new demo script | 1.5 d | cuttable | 25 Aug |

**Spine (1–6, minimal 7, 9) ≈ 19.5 days.** Phases 1–4 land before the 8 August hole; nothing
half-finished is carried across it.

**Checkpoints.** 7 August: phases 1–4 complete, saga green, `reconcile` clean, tree committed and
tagged — the state to walk away from. 20 August: the go/no-go on fallback versus pivot
(`deploy/fallback.md`).

---

## Part 9 — Tests

Your eight, plus:

- Deterministic step keys: two connector attempts for the same transaction produce byte-identical
  idempotency keys (§1.1).
- A credit that times out and then succeeds on replay does not release the hold (§1.2).
- The recovery sweeper drives a transfer abandoned in `credit_pending` to `completed`, and one
  abandoned in `debit_held` to `reversed` (§1.3).
- `postLedgerEntries` still rejects unbalanced and wrong-currency postings after the wallet removal.
- The append-only trigger still rejects UPDATE and DELETE after migration 0005.
- Resolving a VPA with no linked account returns a distinct, handled error (§1.7).
- A settlement cycle returns every position to zero and is replay-safe if run twice.

The schema-introspection test you asked for (§Part 2) runs against `information_schema.columns` in
the api database and fails on any column matching `balance`. It is also a good screenshot.

---

## Part 10 — Decisions taken in review (26 July 2026)

1. **Spine-first, with 5 and 6 promoted into the spine.** Phases 1–4 complete before 8 August.
   Parallel tracks per §1.9.
2. **Cross-currency is off the cut list.** It is the positioning, and cutting it saves almost
   nothing — the same hold/credit sequence with two ledger legs instead of one.
3. **Recovery sweeper in scope, phase 4.** §1.1 and §1.3 are one decision: deterministic step keys
   are what make the sweeper possible, because replaying the credit under the original key is
   simultaneously the query and the fix. That is why §1.2 needs no extra endpoint and neither does
   the sweeper.
   **Demo it deliberately** — close the laptop mid-transfer, reopen, let it resolve on stage. Most
   student prototypes fall over when you do that.
4. **FX book seeded and reported**, sized so demo transfers read small against it (§1.6). Reconcile's
   teeth are positions-against-caps and derived-versus-recorded-cycles, not the trivially-true
   per-currency assertion.
5. **Destructive migration accepted**, on two conditions: it is its own commit immediately after a
   green run, and the commit before it is tagged. Tag `v0.1.0-wallet-demo` already exists.

## Part 11 — Fallback

`deploy/fallback.md`. The pivot is a bet that can be lost without losing the competition, but only
if the fallback is standing before migration 0005. Three isolation requirements, two of which fail
silently: separate database (0005 drops `wallets`), separate Redis index (shared BullMQ prefix means
the two settlement workers eat each other's jobs), separate port.

Rehearse it on the actual phone before 8 August. A fallback nobody has run is not a fallback.
