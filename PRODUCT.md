# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

CaribPay ships one consumer app to iOS and Android from a single Expo/React Native codebase.
Today it presents one shared design language on both platforms rather than adapting per OS;
future work should honour native affordances and expectations on each platform where they
conflict with that shared language.

## Users

**Primary: everyday Caribbean consumers moving money between islands.** The representative
user is a working adult in a small island economy — the design persona is Marcus Bellamy in
St. Kitts & Nevis, holding an EC$ (XCD) home wallet — sending money to family, friends, or
counterparts in Jamaica, Barbados, or Trinidad. They are on a phone, often on mobile data,
frequently sending a modest amount that matters to the person receiving it. They are not
finance professionals and should never need to understand FX mechanics, settlement, or
correspondent banking to send money confidently.

Design decisions optimise for this real user. The CANTO Innovation Challenge judges
(see Operating Context) are an audience, not the design target: they should see a product,
not a pitch.

## Product Purpose

CaribPay is a regional payment interoperability platform for the Caribbean — a consumer
wallet riding atop CAPSS (Caribbean Payment and Settlement System). It makes instant,
fee-free, cross-island wallet-to-wallet transfers possible in five currencies (XCD, JMD, BBD,
TTD, USD), with QR-based receive and pay.

Success is a person in one island sending money to another island in seconds, understanding
exactly what the recipient will get and what it cost them, without the transfer being routed
through the US dollar and without a fee eroding it.

## Positioning

**Intra-Caribbean payments that do not transit the US dollar.** Today, moving money between
Caribbean islands typically routes through USD correspondent banking, which adds cost, delay,
and an external dependency. CaribPay settles island-to-island directly against a regional
settlement layer, so an XCD → JMD transfer is a single regional movement rather than two
foreign-exchange hops.

Two consequences are load-bearing to the proposition and are stated in the product:
transfers are **fee-free**, and **no US dollar is in the route**.

## Operating Context

- **Cross-island remittance between individuals**, not merchant payments or payroll.
- Recipients are identified by a shareable wallet address (`CW-XXXX-XXXX-XXXX-XXXX`), by a
  saved contact, or by scanning a signed CaribPay QR code.
- A transfer crosses a currency boundary more often than not, so a live FX quote with a
  60-second lock is part of the normal send flow, not an edge case.
- Settlement is asynchronous. A transfer moves `initiated` → `pending_settlement` → `settled`
  or `failed`, and the user watches that transition happen. Money leaving and money arriving
  are separate, observable events.
- **CANTO Innovation Challenge 2026**, judged 26–27 August 2026, is the near-term milestone.
  The prototype is demonstrated live, and must withstand technical Q&A about how the ledger
  and settlement actually work.
- Built and maintained by a team of four students under deadline; the codebase must stay
  readable and boring in preference to clever.

## Capabilities and Constraints

**Confirmed capabilities:** email/password accounts with rotating refresh tokens; one wallet
per user per currency, opened on demand; cross-currency and same-currency transfers with a
locked quote; a unified transaction feed and per-wallet history; saved contacts with a pinned
"quick send" set; signed QR receive and scan-to-pay; address lookup to confirm who you are
about to pay.

**Durable technical constraints future work must preserve:**

- **All money is integers in minor units.** No floats, ever. Arithmetic and formatting live in
  one shared module.
- **The ledger is append-only.** No update or delete on ledger entries, enforced by a database
  trigger. Balances are derived and must remain reconcilable from entries.
- **Every money-moving endpoint requires an idempotency key**, persisted, with replayed
  responses on duplicates.
- **Every request and response shape is a shared schema**, validated on the server and parsed
  on the client. A shape is never defined twice.
- Settlement is abstracted behind a provider interface. The current implementation is a mock
  CAPSS provider; a real one is a drop-in replacement.

**Terminology:** *wallet* (a currency-specific balance a user holds), *wallet address* (the
shareable `CW-…` identifier), *transfer* (a user-initiated money movement), *settlement* (the
asynchronous regional clearing step), *quote* (a time-limited FX price).

**Deliberately out of scope** — future work must not add these without a decision: real CAPSS
or bank integration, real KYC, NFC, push notifications, WebSockets, fraud/AI monitoring,
merchant payments, fees, admin dashboards, biometrics, dark mode.

**Open decisions:** the split between what the four-student team carries forward and what a
production build would replace has not been made. Where the prototype and a shippable product
diverge, record the divergence rather than silently choosing one.

## Brand Commitments

- **Name:** CaribPay. **Tagline:** "One region. One payment."
- **Logo assets** exist and are committed at `apps/mobile/assets/` (a transparent mark for use
  over dark surfaces, and a square tile used as the app icon and QR centre).
- **A design specification exists** as a 28-screen board in the "CaribPay Mobile UI Design"
  Claude Design project, which the mobile app implements. It is the authority for the visual
  system; deviations from it are deliberate and documented at the point of use in code.
- **Voice:** plain, calm, and concrete about money. State what will happen, what it costs, and
  what has already happened. Never imply money moved before it did, and never imply money was
  lost when a hold was reversed.

## Evidence on Hand

- **Working end-to-end money movement** against a real ledger: cross-currency transfer,
  asynchronous settlement, reversal on failure, and a reconciliation script that proves cached
  balances match the append-only entries.
- **Seeded demo data** (`bun run db:seed:demo`): four users across St. Kitts, Jamaica,
  Barbados, and Trinidad with real balances, transfer history, and saved contacts. Documented
  in `DEMO.md`; the St. Kitts → Jamaica pair is the cross-currency demonstration.
- **A test suite** covering money arithmetic, the ledger's balance invariant, idempotency,
  settlement success and failure, and pagination.

**Absences future work must not fabricate:** there is no real CAPSS connection, no bank
relationship, no regulatory approval, no live users, no transaction volume, no pricing, and no
testimonials or customer references. The FX rates are plausible seeded statics, not a market
feed. Nothing in the product may claim otherwise.

## Product Principles

1. **The user should never carry the complexity of the rails.** Settlement, holds, and FX are
   real and are shown honestly, but in the user's terms — what you sent, what they get, where
   it is now.
2. **Say the true thing about money at every moment.** Pending is pending; a reversed hold is
   money that never left. Status is always stated, never implied by colour alone.
3. **The absence of a fee and the absence of the US dollar are the product.** Where they are
   true, they are worth saying plainly.
4. **Architectural honesty over demo shortcuts.** The prototype must survive technical
   questioning; nothing ships that would embarrass the team in Q&A.
5. **Boring, readable code beats clever code.** Four students maintain this under deadline.

## Accessibility & Inclusion

Established and currently held to:

- All text meets at least 4.5:1 contrast, measured against the lightest stop of any gradient
  it sits on.
- All interactive targets are at least 44×44pt, spaced at least 8pt apart.
- **Status is never communicated by colour alone** — every state carries an icon and a label.
- Type does not go below 11pt.

Not yet addressed, and open: largest-text / dynamic-type layouts, landscape and tablet
layouts, and screen-reader passes on the money flows.
