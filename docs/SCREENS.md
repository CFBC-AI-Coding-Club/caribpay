# CaribPay — Screen Inventory

Every screen in the app, what it is for, and the states each one has. Written to be handed to a
designer who has not seen the product.

**Read `DESIGN.md` first** — it is the visual system (the "Caribbean Nocturne": a deep gradient for
money and identity, a pale lilac page for everything else, Plus Jakarta Sans, a 22pt gutter, tinted
light instead of black shadow). This document is the *what*; `DESIGN.md` is the *how*.

**Important context:** the product pivoted from a **wallet** to a **payment switch**. CaribPay never
holds customer money — it resolves an address, instructs two member banks, and clears the positions
between them. Any earlier design board containing wallets, wallet addresses (`CW-XXXX-…`), top-up or
withdrawal screens is obsolete. Money lives at the user's bank; we show balances we read live and
label them as such.

23 screens, plus the tab bar. Every one already exists in code, so this is a redesign brief, not a
greenfield.

---

## Navigation map

```
splash ──► welcome ──► login / register ──┐
                                          ▼
                          ┌─────────── TAB BAR (4) ───────────┐
                          │  Home · Activity · Contacts · Menu │
                          └───┬──────────┬─────────┬──────────┘
                              │          │         │
   send ─► confirm ─► amount ─► review ──► transfer status
     │                                          │
     └─ scan ──────────────────────────────────►│
                                                ▼
                                        transaction detail

   receive · accounts (list, link) · addresses (list, claim)
   contact/add · profile · settlement
```

---

## 1 · Onboarding (4 screens)

### 1.1 Splash `app/index.tsx`
Brand moment while the session is checked. Nocturne gradient, logo mark, animated.
**States:** one. Resolves to welcome or home within a second.

### 1.2 Welcome `app/welcome.tsx`
Full-bleed nocturne. Oversized ghosted verbs as background texture (Send / Receive / Save /
Convert), the wordmark, headline **"One region. One payment."**, and the line *"Move money across the
islands in seconds — little to no fees, and no US dollar required."*
**Actions:** *Create an account* (solid white on dark), *I already have an account* (ghost).
**Note for redesign:** the marquee currently advertises "Save" and "Convert", which the product does
not do. Two of those four words should change.

### 1.3 Log in `app/login.tsx`
Nocturne header sheet over a white form. Email, password, submit, link to register.
**States:** idle · submitting · error banner ("Could not log you in").
**Gap worth designing:** there is no password recovery anywhere in the app.

### 1.4 Register `app/register.tsx`
Same sheet pattern. Full name, email, password (8+), country picker (12 Caribbean countries + US,
each with a circular flag). An info notice: **"You'll get a CaribPay address"** — connect a bank
afterwards and it starts working.
**States:** idle · submitting · field error (password too short) · error banner · country picker
sheet open.

---

## 2 · Tab roots (4 screens)

All four share a header: 20pt/800 title with a 13pt muted subtitle beneath.

### 2.1 Home `app/(tabs)/home.tsx`
The most important screen.
- Greeting row: "Welcome back" + full name, and a **bell with an unread dot**.
- **Nocturne balance card** — the signature component. Says **"At your bank"**, a flag+currency chip
  on a 20% black scrim, the balance split into three type sizes (24pt symbol / 40pt dollars / 24pt
  cents), the institution name and masked account number, and a footer line *"As reported by your
  bank just now."*
- **Four quick-action tiles**: Send · Receive · Scan · Accounts. 56pt rounded squares.
- "Other accounts" list, each with its own live balance.
- "Regional transfers" — the six most recent, with a "See all".

**States:** loading (skeleton) · error · **no account connected** (the first-run state — a new user
lands here and must connect a bank before anything works) · one account · several accounts · balance
loaded / balance failed per card / balance still loading per card.

### 2.2 Activity `app/(tabs)/activity.tsx`
"Transfers" · "Across your accounts · N movements". Filter chips (All / Sent / Received / Pending).
Transfers grouped by day under Today / Yesterday / month headings. Infinite scroll with "Load more".
Opening this tab clears the unread badge.
**States:** loading · error · no transfers at all · no transfers matching the filter · loaded ·
loading more.

### 2.3 Contacts `app/(tabs)/contacts.tsx`
"Contacts" · "N saved across N countries". A pinned **quick-send row** of avatars at the top, then a
searchable list. Each row: avatar with a country flag badge, name, their address, currency.
**States:** loading · error · no contacts · no search matches · loaded.
**Note:** a contact whose owner has not connected a bank shows "no bank connected yet".

### 2.4 Menu `app/(tabs)/menu.tsx`
Nocturne profile card at the top (avatar, name, email, "KYC verified" pill), then two grouped row
sets: Profile · Bank accounts · Your addresses · Contacts · Transfers — then Settlement positions ·
Help & support · Log out (destructive).

### 2.5 Tab bar `app/(tabs)/_layout.tsx`
88pt, four destinations, white with a hairline top border. Active state thickens the icon stroke as
well as changing hue. **The Activity tab carries a numeric unread badge.**

---

## 3 · Send flow (5 screens) — the centrepiece

Four steps, deliberately in this order. Confirming *who* comes before entering *how much*: paying
the wrong person is the one failure the product cannot take back.

### 3.1 Pick recipient `app/send/index.tsx`
Segmented control: **Contacts | Address**. Contacts list, or a field taking a CaribPay address,
phone number, or email. A "Scan a QR code" button sits below both. An info notice promises *"You'll
see their name before you send."*
**States:** loading accounts · **no bank account connected** (blocks the flow) · contacts loading /
error / empty / loaded · address typed / too short.

### 3.2 Confirm recipient `app/send/confirm.tsx`
**The misdirection control.** Large avatar, "You are paying", the payee's **masked name** ("Devon
C."), their address, and a detail table: their bank, country, and the currency they receive.
**Actions:** *Yes, that's them* / *Someone else*.
**States:** resolving · **not found** · **not payable** (they have an address but no bank connected)
· **that's your own address** · generic failure · resolved.

### 3.3 Enter amount `app/send/amount.tsx`
A converter panel — "You send" with a currency chip that opens an account picker, and "They receive"
below it, fixed by the payee's account. The typed figure is grouped as you type. A rate line, a
60-second **lock countdown pill**, and a "Fee-free" pill. Below: an on-screen numeric keypad and the
primary action, both pinned so neither scrolls away.
**States:** same currency (no conversion) · cross-currency quote loading / loaded / failed · **over
the available balance** · quote lock counting down.

### 3.4 Review `app/send/review.tsx`
Recipient at the top, then a detail table: You send · They receive · Rate (locked, with countdown) ·
Fee (**Free**, with a "No US$" pill) · Arrives.
**Actions:** *Confirm & send* / *Back*.
**States:** normal · **rate moved while you were away** (shows the old quote struck through, the
difference, and the new rate; the action becomes *Confirm at new rate*) · submitting · **rejected**
(red) · **outcome unknown** (amber — "We couldn't confirm this transfer… check your Transfers list
first"). Those last two are deliberately different and must stay visually distinct.

### 3.5 Transfer status `app/transfer/[id].tsx`
Watched live while the two banks talk. A large animated status mark with expanding ripples, a
headline, and the **settlement timeline** — three steps with 28pt circular markers:

> **Held at your bank** → **Clearing across the region** → **Delivered**

"Held" is deliberate: the money is reserved, not sent, and is released in full if the credit fails.
**States:** sending · **delivered** (checkmark pops, "Sent!") · **failed** (nothing left the
account) · **returning / returned** (the hold was released — "No money left your account"). Actions
change per state: Done · View details · Try again · Back to home.

---

## 4 · Receive (2 screens)

### 4.1 Receive `app/receive.tsx`
**The address leads**, because it is the thing a person can say over a phone call. A large tappable
card showing `amara@caribpay` with "Tap to copy", the signed QR beneath it with the logo tile at its
centre, a chip saying which currency arrives, and Copy / Share buttons.
**States:** loading · **no bank connected** (the address exists but cannot receive) · error · loaded
· copied (2-second confirmation).

### 4.2 Scan `app/scan.tsx`
Dark camera screen. A 266pt reticle with corner brackets and a sweeping scanline, a torch toggle.
**States:** permission not asked · **permission denied** · scanning · checking the code · **invalid
or unsigned code** (with "Scan again" / "Enter address manually"). Returns either to the send
confirmation or to the contact form, depending on where it was opened from.

---

## 5 · Bank accounts (2 screens)

### 5.1 Accounts `app/accounts/index.tsx`
List of connected accounts: flag, institution, masked number, currency, live balance, "Default"
pill. A footnote: *"Balances are read from your bank each time you open this screen. CaribPay never
stores them."*
**States:** loading · error · none connected · loaded · per-row balance loading / unavailable.

### 5.2 Connect an account `app/accounts/link.tsx`
Bank picker (21 regional institutions, grouped so the user's own country comes first, each with a
flag), account number field, and a notice: **"CaribPay never holds your money."**
**States:** idle · picker sheet open · verifying with the bank · error (not found, inactive, wrong
currency, bank unreachable) · success.

---

## 6 · Addresses (2 screens)

### 6.1 Your addresses `app/directory/keys.tsx`
Up to five. Each row: a type icon, the address, its type, and pills for **Primary** / **Unverified**.
Non-primary rows carry a **Release** action. A notice explains that releasing is permanent — an
address is never reissued to anyone.
**States:** loading · error · loaded · confirming release (system alert) · release failed.

### 6.2 Claim an address `app/directory/claim.tsx`
A field for the local part with `@caribpay` shown as the suffix, and **live availability as you
type**. The refusal says which rule you hit: taken · **too easily confused with one already in use**
· reserved · malformed · provider not active.
**States:** empty · checking · available (green tick) · unavailable with a reason · claiming ·
error.

---

## 7 · Supporting (3 screens)

### 7.1 Add contact `app/contact/add.tsx`
Address field with live lookup, a "Scan their QR code" button, a display-name field prefilled from
the resolved name (the user's own label wins once they edit it), and a "pin to quick send" toggle.
**States:** empty · looking up · not found · resolved (shows a confirmation card with avatar) ·
saving · save error · duplicate.

### 7.2 Profile `app/profile.tsx`
Nocturne header with a large avatar. Detail rows: full name, email, country, home currency, CaribPay
address, bank accounts connected. Two stat cards: **Transfers sent** and **Fees paid, ever**
(a real, exact zero — not a placeholder).

### 7.3 Settlement positions `app/settlement.tsx`
The pitch made visible. What each member bank currently owes or is owed, and the switch's own FX
book. A notice explains the model: instant to the payee, netted between banks.
**States:** loading · error · every position flat · positions outstanding.

---

## Cross-cutting notes for the designer

**Every screen needs four states, not one.** Loading, empty, error, and loaded — plus a per-item
state wherever a live bank balance appears, because each bank answers at its own speed and a card
can fail on its own.

**Money must never be ambiguous.** Amounts, addresses, rates, countdowns and timestamps are all set
in tabular figures. The amount a payer types is grouped as they type it so the digit count reads the
same on the amount screen as on review.

**Status is never colour alone.** Every state carries an icon *and* a word. There are three
user-facing transfer states (held / clearing / delivered) mapped from eight internal ones.

**The nocturne gradient is scarce on purpose.** It marks money and identity only: the balance card,
the auth headers, the profile header, the splash. It is never a page background, a modal, or an
empty state.

**Accessibility currently held to:** 4.5:1 text contrast measured against the lightest gradient
stop, 44pt minimum targets spaced 8pt apart, nothing below 11pt, and status never by colour alone.
Open and worth designing for: largest-text / dynamic-type layouts, landscape and tablet, and a
screen-reader pass on the money flows.

**Light only.** Dark mode is deliberately out of scope — darkness is already spent semantically on
the nocturne, so a dark theme would be a different design system rather than a palette swap.
