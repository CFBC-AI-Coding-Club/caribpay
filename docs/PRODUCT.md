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
St. Kitts & Nevis, holding an account at a local bank — sending money to family, friends, or
counterparts in Jamaica, Barbados, or Trinidad. They are on a phone, often on mobile data,
frequently sending a modest amount that matters to the person receiving it. They are not
finance professionals and should never need to understand FX mechanics, clearing, or
correspondent banking to send money confidently.

Design decisions optimise for this real user. The CANTO Innovation Challenge judges
(see Operating Context) are an audience, not the design target: they should see a product,
not a pitch.

## Product Purpose

CaribPay is a **payment switch** for the Caribbean — the messaging and clearing layer between
member banks, in the mould of UPI and PAPSS. It is deliberately **not a wallet**: it never
holds customer money at any point. Money stays at the member banks. CaribPay resolves an
address to an account, instructs the two banks, and clears the resulting positions between
them.

It makes instant, fee-free, cross-island transfers possible in five currencies (XCD, JMD, BBD,
TTD, USD), addressed by a human-readable address (`amara@caribpay`), a phone number, an email,
or a signed QR code.

Success is a person in one island sending money to another island in seconds, understanding
exactly what the recipient will get and what it cost them, without the transfer being routed
through the US dollar, without a fee eroding it, and without the money ever leaving the
banking system on the way.

## Positioning

**Intra-Caribbean payments that do not transit the US dollar.** Today, moving money between
Caribbean islands typically routes through USD correspondent banking, which adds cost, delay,
and an external dependency. CaribPay settles island-to-island directly against a regional
clearing layer, so an XCD → JMD transfer is a single regional movement rather than two
foreign-exchange hops.

Three consequences are load-bearing to the proposition and are stated in the product:
transfers are **fee-free**, **no US dollar is in the route**, and **CaribPay never holds the
money**.

That third one is the regulatory argument as well as the product one. We are a payment
initiation and clearing operator, not an e-money issuer: no customer funds, no safeguarding
account, no float, and a materially lighter ask to the ECCB than a stored-value wallet would
carry. It is the same reason NPCI could scale UPI without being a bank.

## Operating Context

- **Cross-island remittance between individuals**, not merchant payments or payroll.
- Recipients are identified by a shareable address (`amara@caribpay`), a phone number, an
  email, a saved contact, or a scanned signed QR code. The suffix is a PSP handle, so a member
  bank can own `@ncb` later without a migration.
- **A person must connect a bank account before they can be paid.** An address routes to an
  account; until one is linked it resolves to nothing. This is inherent to the model and true
  of UPI too — it puts a step at the front of onboarding that must be designed for, not
  apologised for.
- A transfer crosses a currency boundary more often than not, so a live FX quote with a
  60-second lock is part of the normal send flow, not an edge case.
- A transfer is a conversation with two banks, and the user watches it happen: a hold is placed
  at the payer's bank, the payee's bank is credited, then the hold is drawn down. If the credit
  is refused the hold is released and the payer is made whole by their own bank. Money being
  *reserved* and money *moving* are separate, observable events.
- The credit to a payee is instant and irrevocable; settlement between the member banks is
  deferred and netted, exactly as UPI and PAPSS do it.
- **CANTO Innovation Challenge 2026**, judged 26–27 August 2026, is the near-term milestone.
  The prototype is demonstrated live, and must withstand technical Q&A about how the clearing
  ledger and the bank connections actually work.
- Built and maintained by a team of four students under deadline; the codebase must stay
  readable and boring in preference to clever.

## Capabilities and Constraints

**Confirmed capabilities:** email/password accounts with rotating refresh tokens; linking bank
accounts at simulated member institutions, verified through a connector; live balances read
from the bank and cached nowhere; human-readable addresses with confusable and reserved-word
protection; cross-currency and same-currency transfers with a locked quote; a resolved-name
confirmation step before any amount is entered; a unified transaction feed; saved contacts;
signed QR receive and scan-to-pay; arrival notifications on the recipient's device; net
settlement between member banks; and a reconciliation that proves the books.

**Durable technical constraints future work must preserve:**

- **CaribPay holds no customer money.** There is no column in the switch's database that holds
  a customer balance, and a test fails if one is ever added. This is what makes us a payment
  initiation and clearing operator rather than an e-money issuer.
- **The switch reaches customer accounts only over HTTP, through `BankConnector`.** It has no
  credentials for the banks' database. The boundary is what makes the claim inspectable.
- **All money is integers in minor units.** No floats, ever. Arithmetic and formatting live in
  one shared module.
- **The ledger is append-only**, enforced by a database trigger. It accounts for inter-bank
  positions, which must remain derivable from entries.
- **Instructions to a bank carry a derived idempotency key**, never a generated one. A retry
  must replay, not repeat. This single property is what makes timeouts survivable.
- **A refusal is actionable; an unknown is not.** Only an explicit bank refusal may trigger a
  reversal. A timeout leaves the outcome unknown and is resolved by re-sending the identical
  instruction, which is simultaneously the question and the fix.
- **Recovery drives forward, never back.** Past the credit the money has irrevocably reached
  the payee.
- **A released address is never reissued**, to anyone, including its original owner.
- **Every request and response shape is a shared schema**, validated on the server and parsed
  on the client — including across the switch/bank boundary. A shape is never defined twice.

**Terminology:** *address* (the shareable `name@psp` identifier), *directory key* (an address,
phone, or email that routes to an account), *linked account* (a bank account a user has
connected), *hold* (funds reserved at the payer's bank), *position* (what a member bank owes or
is owed), *settlement cycle* (the netting run that returns positions to zero), *quote* (a
time-limited FX price). The word *wallet* no longer describes anything in this system.

**Deliberately out of scope** — future work must not add these without a decision: real bank
integration, real KYC, real OTP delivery, NFC, push notifications, WebSockets, fraud/AI
monitoring, merchant payments, cards, fees, admin dashboards, biometrics, dark mode,
collect/pull requests, autopay mandates.

**Never use the name CAPSS.** We are building the settlement system, not integrating with
someone else's.

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
- **Every institution named in the product is simulated.** We have no relationship with any of
  them. The disclosure lives in `DEMO.md`, the institutions seed file, and what the team says
  when presenting — deliberately not as in-app chrome, which was repeated on five screens and
  read as a defect rather than a disclosure. **This is a presentation obligation now, not a
  rendered one:** say it out loud when the app is on screen.
- **Voice:** plain, calm, and concrete about money. State what will happen, what it costs, and
  what has already happened. Never imply money moved before it did, never imply money was lost
  when a hold was reversed, and never claim to know an outcome that is unknown.

## Evidence on Hand

- **Working end-to-end money movement across a network boundary**: a cross-currency transfer
  from a simulated St. Kitts bank to a simulated Jamaican one — resolved by address, held,
  credited, confirmed and cleared — with both banks' balances moving by exactly the right
  amounts and no holds left outstanding.
- **Every failure branch works**: a refused hold posts nothing to the ledger; a refused credit
  releases the hold and leaves the payer exactly as they started; a transfer abandoned
  mid-saga is driven forward by the recovery sweeper without moving money twice.
- **`bun run settle`** nets member-bank positions to zero and prints the netting summary.
  **`bun run reconcile`** proves per-currency net zero, positions against prefunded caps, no
  transfer stalled mid-saga, and no hold stranded at any bank — that last check asked of the
  banks over the network rather than of our own tables.
- **Seeded demo data across both services** (`db:seed:demo --reset` and `db:seed:bank`): four
  users across St. Kitts, Jamaica, Barbados and Trinidad with memorable addresses, linked
  accounts, and verified phone keys. Documented in `DEMO.md`; the St. Kitts → Jamaica pair is
  the cross-currency demonstration.
- **145 tests**, including a switch/bank integration suite that runs the real API against a
  real mock bank over HTTP with two Postgres databases.

**Absences future work must not fabricate:** there is no real bank connection, no relationship
with any institution named in the app, no regulatory approval, no live users, no transaction
volume, no pricing, and no testimonials or customer references. The FX rates are plausible
seeded statics, not a market feed. Nothing in the product may claim otherwise.

## Product Principles

1. **The user should never carry the complexity of the rails.** Holds, clearing and FX are real
   and are shown honestly, but in the user's terms — what you sent, what they get, where it is
   now. Eight internal states become three: held, clearing, delivered.
2. **Say the true thing about money at every moment.** Held is held, not sent; a reversed hold
   is money that never left; an unknown outcome is unknown, not a failure. Status is always
   stated, never implied by colour alone.
3. **The absence of a fee, the absence of the US dollar, and the absence of our hands on the
   money are the product.** Where they are true, they are worth saying plainly.
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
