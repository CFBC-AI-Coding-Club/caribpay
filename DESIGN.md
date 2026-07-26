---
name: CaribPay
description: Instant, fee-free money movement across the Caribbean — dusk-lit surfaces over a pale daylight interface.
colors:
  trade-wind-blue: "#5F6CF6"
  interactive: "#5560E8"
  interactive-pressed: "#4348C4"
  link: "#4F59E0"
  primary-soft: "#F0EEFE"
  nocturne-wine: "#460D2C"
  nocturne-indigo: "#181136"
  nocturne-royal: "#1E1A76"
  lavender: "#D689EE"
  off-white: "#FCE7F9"
  ink: "#1A1340"
  ink-muted: "#5A5578"
  ink-faint: "#6E6890"
  ink-subtle: "#9A94B8"
  ink-on-tint: "#453F6B"
  surface: "#FFFFFF"
  page: "#F6F5FB"
  on-dark: "#FFFFFF"
  success: "#0E6A4C"
  success-soft: "#E4F3EC"
  pending: "#8A5A0F"
  pending-soft: "#FBF1DE"
  pending-border: "#EBD9B4"
  error: "#C63A3A"
  error-soft: "#FBECEC"
  error-text: "#A03535"
  error-border: "#F0CFD8"
  gain-on-dark: "#C4F3E0"
  neutral-soft: "#F0EEF7"
  segment-track: "#EDEBF6"
  tint-row: "#F1EFF9"
  tint-pill: "#E5E2F1"
  disabled-bg: "#D8D5E8"
  disabled-text: "#8681A0"
  disabled-surface: "#F4F2FA"
  disabled-surface-text: "#A5A0BD"
typography:
  display:
    fontFamily: "PlusJakartaSans_800ExtraBold"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.8px"
  amount:
    fontFamily: "PlusJakartaSans_800ExtraBold"
    fontSize: "31px"
    fontWeight: 800
    letterSpacing: "-0.62px"
  hero:
    fontFamily: "PlusJakartaSans_800ExtraBold"
    fontSize: "24px"
    fontWeight: 800
    letterSpacing: "-0.24px"
  heading:
    fontFamily: "PlusJakartaSans_800ExtraBold"
    fontSize: "20px"
    fontWeight: 800
    letterSpacing: "-0.2px"
  title:
    fontFamily: "PlusJakartaSans_700Bold"
    fontSize: "17px"
    fontWeight: 700
  body:
    fontFamily: "PlusJakartaSans_500Medium"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  small:
    fontFamily: "PlusJakartaSans_500Medium"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "PlusJakartaSans_600SemiBold"
    fontSize: "12px"
    fontWeight: 600
  pill:
    fontFamily: "PlusJakartaSans_700Bold"
    fontSize: "11px"
    fontWeight: 700
rounded:
  sm: "8px"
  chip: "12px"
  field: "14px"
  card: "16px"
  cardLg: "20px"
  sheet: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
  gutter: "22px"
components:
  button-primary:
    backgroundColor: "{colors.interactive}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    height: "52px"
    padding: "0 24px"
  button-primary-pressed:
    backgroundColor: "{colors.interactive-pressed}"
    textColor: "{colors.on-dark}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled-bg}"
    textColor: "{colors.disabled-text}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    height: "52px"
  button-on-dark-primary:
    backgroundColor: "{colors.on-dark}"
    textColor: "{colors.link}"
    rounded: "{rounded.card}"
    height: "52px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "54px"
    padding: "0 16px"
  pill-settled:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  pill-pending:
    backgroundColor: "{colors.pending-soft}"
    textColor: "{colors.pending}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  pill-failed:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: CaribPay

## Overview

**Creative North Star: "The Caribbean Nocturne"**

The system runs on a single image: dusk falling across the islands. A gradient travels from
deep wine through near-black indigo into royal blue — the last of the light on the water,
then night, then the blue hour. That gradient is not decoration. It is where money lives:
the balance you hold, the identity you present, the moment before you sign in. Everything
else is daylight — a pale lilac page (#F6F5FB) holding white cards, where money is counted,
listed, and moved.

The two states are the product. You are always either looking at what you *have* (nocturne)
or doing something with it (daylight). A screen that blurs the two is off-system.

Density is generous but never soft-headed. Cards breathe on a 4pt grid with a 22pt screen
gutter; corners are rounded 16–20px with nothing sharp anywhere; type is one family across
nine sizes and five weights. Money is always set in tabular figures, because a column of
amounts that shifts as digits change reads as careless, and this product cannot afford to
read as careless. The tone is calm and trustworthy under the finger: a press darkens one
step and never scales, focus changes colour and never geometry.

This system is explicitly **not** crypto-neon fintech, not legacy retail banking, not a
playful neobank, and not Material 3 with a brand colour swapped in. It must also not read as
machine-generated: no default purple-on-white SaaS gradient, no emoji standing in for icons,
no decorative charts, no symmetry so even it feels untouched. It should sit comfortably
beside the modern fintech apps a Caribbean user already has on their phone — and then be
recognisably itself because of the nocturne, the flags, and the fee-free claim stated plainly.

**Key Characteristics:**

- Two worlds — nocturne for holdings and identity, daylight for action and history
- One typeface (Plus Jakarta Sans), nine sizes, five weights, no exceptions
- Tabular figures on every amount, address, rate, and timestamp
- Coloured light instead of black shadow on anything that carries money
- Circular national flags as the primary signal of place and currency
- Status is never colour alone — always an icon and a word

## Colors

A cool, lilac-leaning palette: one blue does all the interactive work, one gradient carries
all the weight, and three status hues appear only to report what actually happened.

### Primary

- **Trade-Wind Blue** (`{colors.trade-wind-blue}`): The brand primary — named for the winds
  that connect the islands, which is what the product does. It fills selection borders, radio
  dots, focus rings, and the first stop of the brand gradient. It is deliberately *not* used
  behind white text.
- **Interactive** (`{colors.interactive}`): The same hue darkened ~6% so white text on it
  reaches 4.97:1. Every solid button, active tab chip, and toggle track. Visually
  indistinguishable from Trade-Wind Blue; the difference exists purely so text passes.
- **Link** (`{colors.link}`): Darkened a shade further (5.05:1) for text that must be read as
  interactive — inline links, "Add wallet", the converted amount on the Send screen.
- **Primary Soft** (`{colors.primary-soft}`): The blue's tint. Icon chips, "Load more",
  quiet secondary actions, the Change button beside a recipient.

### Secondary

- **The Nocturne** (`{colors.nocturne-wine}` → `{colors.nocturne-indigo}` →
  `{colors.nocturne-royal}`, 135°, stops at 0 / 40% / 100%): The signature surface. It carries
  the total-balance card, wallet balances, the splash, the auth headers, and the profile
  header. Nothing else may wear it.

### Tertiary

- **Lavender** (`{colors.lavender}`): A gradient stop and the QR scanline glow. Never a fill,
  never text.
- **Off White** (`{colors.off-white}`): The final stop of the brand gradient. Never text.

### Neutral

- **Ink** (`{colors.ink}`): All primary text, and the scan screen's background.
- **Ink Muted** (`{colors.ink-muted}`): Secondary text — row subtitles, field labels, the
  quiet half of a detail row.
- **Ink Faint** (`{colors.ink-faint}`): Placeholders, section labels, disabled-adjacent text.
- **Ink Subtle** (`{colors.ink-subtle}`): Chevrons and affordance hints only.
- **Ink on Tint** (`{colors.ink-on-tint}`): Text sitting on a tinted (non-white) row.
- **Surface** (`{colors.surface}`) / **Page** (`{colors.page}`): White cards on a pale lilac
  page. The page is never white; the card is never anything else.

### Status

- **Settled** (`{colors.success}` on `{colors.success-soft}`): Money that has arrived. Also
  the "Free" fee value and the "Fees paid, ever" figure.
- **Pending** (`{colors.pending}` on `{colors.pending-soft}`): In flight, and the rate-moved
  recovery notice. Amber-brown, never yellow.
- **Failed** (`{colors.error}`, text `{colors.error-text}` on `{colors.error-soft}`): A
  reversed hold. Used at full strength only on the failure mark; text steps down for contrast.
- **Gain on Dark** (`{colors.gain-on-dark}`): The one mint accent, exclusively for a positive
  weekly delta on the nocturne balance card.

### Named Rules

**The Two-Blue Rule.** `trade-wind-blue` fills and outlines; `interactive` and `link` carry
text. They are the same hue ~6% apart and must never be swapped — the split exists solely so
white text clears 4.5:1. If you are typesetting on blue, you are using the wrong blue.

**The Nocturne Rule.** The deep gradient is reserved for surfaces that hold money or identity:
balance cards, auth headers, the profile header, the splash. It is never a page background,
never a modal, never an empty state. Its scarcity is what makes a balance feel like a balance.

**The Silent Accent Rule.** Lavender and Off White are gradient stops and glows only. They
never carry text, never fill a button, never tint a card.

**The Never Colour-Alone Rule.** Settled, Pending, and Failed always ship an icon *and* a
word. A coloured dot alone is not a status.

**The One Appearance Rule.** CaribPay ships light-only, locked at
`userInterfaceStyle: "light"`. This is a design constraint, not unfinished work.

Both platform guides treat dark as first-class, and normally they would be right — but this
system already spends darkness semantically. The Nocturne means *"this surface holds your
money or your identity."* In a dark theme the page itself goes dark, the gradient stops being
an event, and the two-world thesis this system is built on collapses into one world. A dark
CaribPay is therefore not a palette swap; it is a different design system, and it needs the
Nocturne replaced with some other scarce signal before it can exist.

Until that work is done, the honest thing is to lock the appearance rather than ship a broken
half-inversion. Do not add a dark palette to these tokens without first deciding what carries
the "this is money" signal in its place.

## Typography

**Display / Body / Label Font:** Plus Jakarta Sans (fallback: system sans)

**Character:** One geometric humanist sans doing everything, from an 11pt pill to a 40pt
balance. Its slightly squared bowls and open apertures keep large numerals confident without
turning ornamental, and it holds up at 11pt on a cheap Android screen — which is the real
test, not the design board.

### Hierarchy

- **Display** (800, 40px, 1.05, −0.02em): The balance figure and the Welcome headline. One
  per screen, maximum.
- **Amount** (800, 31px, −0.02em): Transaction detail amounts and the Send composer's two
  figures.
- **Hero** (800, 24px): Transfer status verdicts ("Sent!", "Transfer failed"), auth headings,
  empty-state titles.
- **Heading** (800, 20px, −0.01em): Screen headings on tab roots — "Transfers", "Contacts".
- **Title** (700, 17px): Navigation-bar titles, section headers, primary button labels.
- **Body** (500, 15px, 1.5): Row titles, field values, paragraph copy.
- **Small** (500, 13px, 1.45): Secondary body, rate lines, supporting copy.
- **Label** (600, 12px): Field labels, row subtitles, stat captions.
- **Pill** (700, 11px): Status pills, tab-bar labels, section labels, metadata. The floor.

### Named Rules

**The Tabular Rule.** Every amount, wallet address, FX rate, countdown, and timestamp is set
with tabular figures. A number that reflows as its digits change reads as sloppy, and in a
money app sloppy reads as untrustworthy.

**The Weight-Is-A-Family Rule.** Never `fontWeight`. React Native does not synthesise weights
on Android — `fontWeight: "800"` silently renders Regular. Every weight is its own registered
family, reached through `font(size, weight)`.

**The Eleven Floor Rule.** Nothing ships below 11px. If content will not fit at 11px, the
layout is wrong, not the type.

## Layout

A single-column mobile system on a 4pt grid. The screen gutter is **22px** on every screen;
cards inset from it rather than bleeding, so the pale page always frames the white.

Vertical rhythm comes from the spacing scale (4 / 8 / 12 / 16 / 20 / 24 / 32). Rows inside a
card use 12–14px vertical padding with a hairline divider at 5% ink; the last row drops its
divider. Cards in a stack sit 10px apart. Section headings take 16px above and 12px below.

Screens are built as a fixed header, a flexible middle, and a pinned action zone at the foot —
the primary action is never something you scroll to find. Safe-area insets are applied at the
screen scaffold, and the iOS home-indicator pill is drawn only when the OS is not already
reserving space for one.

The tab bar is 88px tall with four destinations. Detail screens push over it.

### Named Rules

**The 22 Rule.** Screen gutter is 22px. Not 20, not 24. Every full-width element aligns to it,
and any element that breaks the gutter (the keypad at 30px, the nocturne card's inset) is
doing so deliberately and visibly.

## Elevation & Depth

Depth is expressed as **tinted light, not shadow**. Ordinary surfaces — cards, list
containers, icon buttons — sit on a neutral ambient shade at 6–8% ink, just enough to lift
white off the pale page. But anything that carries money or is the primary action emits
*coloured* light: the balance card and every primary button cast a Trade-Wind Blue glow, not a
black shadow. The result is that value on screen appears self-illuminated, and the eye finds
the one thing worth pressing without a size or colour escalation.

### Shadow Vocabulary

- **Card** (`0 2px 8px rgba(26,19,64,0.06)`, elevation 2): White cards and list containers.
- **Panel** (`0 2px 10px rgba(26,19,64,0.08)`, elevation 3): Detail tables and the Send
  converter — a half-step above a card.
- **Control** (`0 2px 6px rgba(26,19,64,0.08)`, elevation 2): Circular icon buttons.
- **Tile** (`0 4px 12px rgba(26,19,64,0.08)`, elevation 3): Home quick-action tiles.
- **Primary** (`0 8px 14px rgba(85,96,232,0.40)`, elevation 6): Primary buttons. Blue, not
  black.
- **Hero** (`0 12px 18px rgba(85,96,232,0.35)`, elevation 8): The nocturne balance card.

### Named Rules

**The Tinted Light Rule.** If a surface holds money or is the primary action, its shadow is
Trade-Wind Blue. Everything else casts neutral ink shade. A black shadow under a primary
button is a bug.

**The Press Drops The Glow Rule.** The blue glow reads as "raised", so it is removed on press
and when disabled. A disabled button that still glows is lying about being pressable.

## Shapes

Nothing in this system has a sharp corner. The radius scale climbs with the size of the thing:
8px for swatches and skeletons, 12px for chips and small icon buttons, 14px for input fields,
16px for cards and buttons, 20px for the large money-bearing cards, 24px for sheets and the
scan reticle, fully round for pills, avatars, flags, and status marks.

Borders are hairlines, never structure: 1px at 8–14% ink for resting fields and card edges,
5–6% for dividers inside a card. Two surfaces are enclosed rather than bordered — the flags
carry an inset 1px ring at 14% so pale flags still read as a disc on white, and the focus ring
sits *outside* the field as an overlay rather than thickening its border.

Circles do specific work: a country flag, a person (initials avatar), or a status verdict. A
circle in this system always means "who" or "what happened".

### Named Rules

**The No Sharp Corner Rule.** There is no 0-radius surface anywhere in CaribPay. If something
needs to feel harder, raise contrast or weight — never square the corners.

## Components

### Buttons

- **Character:** Calm and trustworthy. Full-width, generous, and completely still.
- **Shape:** Rounded 16px (`{rounded.card}`), 52px tall for a primary screen action, 48px when
  two or three sit in a row.
- **Primary:** Interactive blue with white 17px/700 label and the blue Primary glow.
- **Press:** Darkens one step to `{colors.interactive-pressed}` and drops the glow. **It never
  scales.**
- **Disabled:** `{colors.disabled-bg}` with `{colors.disabled-text}`, no glow.
- **Loading:** The label is replaced by a spinner in the label's own colour; the button keeps
  its exact size.
- **Secondary:** White with a 1px hairline at 14% ink and ink label. **Ghost:** transparent
  with a muted label. **Danger:** white with a red label and a red-tinted hairline — destructive
  actions are never solid red.
- **On the nocturne:** solid white with a Link-blue label for primary; translucent white at 14%
  with a 22% border for secondary.

### Cards / Containers

- **Corner Style:** 16px for a standard card, 20px for money-bearing and detail panels.
- **Background:** Always `{colors.surface}` on the `{colors.page}` background, or the Nocturne
  when it holds a balance.
- **Shadow Strategy:** Card or Panel from the vocabulary above; Hero when it is the nocturne.
- **Internal Padding:** 14px standard; 18–22px for panels and the nocturne.
- **Row groups** are a single card holding hairline-divided rows, not a stack of separate cards.

### Inputs / Fields

- **Style:** White, 14px radius, 54px tall (52px in dense forms), 1px hairline at 10% ink, with
  an optional 19px leading icon in Ink Faint.
- **Focus:** The border *colour* shifts to Trade-Wind Blue and a 2px ring at 40% opacity
  appears 3px outside the field as an absolutely-positioned overlay.
- **Error:** Border goes solid `{colors.error}`; the message replaces the hint below in
  `{colors.error-text}`.
- **Search** is a shorter 46px variant with a leading magnifier and a trailing clear.

### Chips & Pills

- **Filter chips:** Selected is Interactive blue with white 13px/700; unselected is white with
  a 9% hairline and Ink-on-Tint 13px/600.
- **Status pills:** Icon plus word at 11px/700 on the status tint, fully rounded.
- **Segmented control:** A `{colors.segment-track}` track with a white 12px-radius thumb
  carrying a 1px/8% shadow.

### Navigation

- **Tab bar:** 88px, white, 1px top hairline. Four destinations. Active is Link blue with a
  2.2 stroke weight; inactive is Ink Faint at 1.9. **The active state thickens the stroke as
  well as changing hue**, so selection never depends on colour alone.
- **Screen header:** A 44px circular icon button, a centred 17px/700 title, and a 44px trailing
  slot that stays reserved even when empty so the title never shifts between screens.

### Signature Components

**The Nocturne Balance Card.** The system's centrepiece. The deep gradient at 20px radius with
the logo mark bled off the top-right corner at 15% opacity, a flag-and-currency chip on a 20%
black scrim, and the balance split into three type sizes — 24px symbol, 40px dollars, 24px
cents — so the figure reads as money rather than a number.

**The Settlement Timeline.** A vertical rail of three steps (Initiated → Pending settlement →
Settled/Failed) with 28px circular markers: a filled green check for done, a live spinning ring
for in-flight, a hollow 2px outline for upcoming, a filled red cross for failed. The connector
between two steps takes the colour of the step *above* it, so a failed leg shows the break in
the chain. This component is where the product proves it is honest about money.

**The Currency Flag.** Every country is a circular flag drawn as SVG on a 48×48 grid with an
inset 1px ring at 14% ink. Flags badge avatars, label wallets, and sit in currency chips — they
are the fastest signal of "which island" in the entire system.

## Do's and Don'ts

### Do:

- **Do** put money and identity on the Nocturne and everything else on the pale page. The
  two-world split is the system.
- **Do** set every amount, address, rate, and timestamp in tabular figures.
- **Do** reach type through `font(size, weight)`; the weight is a family, not a property.
- **Do** give money-bearing and primary surfaces a Trade-Wind Blue glow, and everything else a
  neutral ink shade.
- **Do** pair every status with an icon and a word.
- **Do** keep the focus ring outside the field as an overlay. Changing a field's border *width*
  on focus reflows the form mid-touch and, on Android, moves focus to the next input.
- **Do** state the fee-free and no-US-dollar facts plainly where they are true — they are the
  proposition, not marketing.
- **Do** keep touch targets at 44pt minimum today, and treat **48dp** as the target on Android.

### Don't:

- **Don't** put text on `{colors.trade-wind-blue}`. Use `{colors.interactive}` or
  `{colors.link}`.
- **Don't** use lavender or off-white for text or fills. They are gradient stops.
- **Don't** scale a button on press, or animate anything that changes layout during a touch.
- **Don't** use the Nocturne as a page background, a modal, or an empty state. Scarcity is the
  point.
- **Don't** add a dark palette to the tokens. See The One Appearance Rule — darkness is
  already load-bearing here, so a dark theme is a redesign, not a variant.
- **Don't** square a corner anywhere in the system.
- **Don't** ship a control that cannot work. A "Cancel transfer" button on a queued settlement
  is a lie; a pin toggle with no backing column is a lie.
- **Don't** let it drift into crypto-neon fintech, legacy retail banking, playful neobank, or
  stock Material 3 with a brand colour swapped in.
- **Don't** let it read as machine-generated: no default purple-on-white gradient hero, no
  emoji as iconography, no decorative charts, no confetti, no filler that exists to occupy a
  grid cell. Every element on screen must be answering a real question the user has about
  their money.
