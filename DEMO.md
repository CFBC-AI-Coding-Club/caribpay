# CaribPay — CANTO Demo Script

A ~5-minute live demo: connect a bank account, send money by address from St. Kitts
to Jamaica, watch it arrive on a second device, then prove the books.

> **Every bank named in this app is simulated.** CaribPay has no relationship with
> St. Kitts-Nevis-Anguilla National Bank, NCB Jamaica, Republic Bank, Scotiabank,
> CIBC, or any other institution in the list. Nothing here connects to a real bank.
> Every screen that shows an institution name carries a "Simulated — no live bank
> connection" notice, deliberately, so a photograph of a screen carries the
> disclaimer with it.

---

## 1. One-time setup (from a clean clone)

```bash
docker compose up -d          # postgres + redis
bun install
bun run db:migrate            # the switch
bun run db:migrate:bank       # the member banks
bun run db:seed:demo -- --reset
bun run db:seed:bank
```

Then three terminals:

```bash
bun run dev:bank    # simulated member banks on :3100
bun run dev:api     # the switch + transfer worker + recovery sweeper on :3000
bun run dev:mobile  # Expo / Metro
```

`RUNNING.md` has the machine-specific detail.

### Demo accounts (password: `demo1234`)

| Name | Email | Address | Bank | Currency |
|---|---|---|---|---|
| Amara Liburd | `amara@caribpay.test` | `amara@caribpay` | St. Kitts-Nevis-Anguilla National Bank | XCD |
| Devon Campbell | `devon@caribpay.test` | `devon@caribpay` | National Commercial Bank Jamaica | JMD |
| Shanice Braithwaite | `shanice@caribpay.test` | `shanice@caribpay` | Republic Bank (Barbados) | BBD |
| Ravi Maharaj | `ravi@caribpay.test` | `ravi@caribpay` | Republic Bank (T&T) | TTD |

Each has a verified phone key too, so resolve-by-phone can be shown without
walking the OTP flow on stage.

---

## 2. The click-path

Two devices, or one device and a second browser/simulator. Amara sends, Devon receives.

**Act 1 — where the money is.**

1. Log in as **amara@caribpay.test**.
2. Home shows a balance **at St. Kitts-Nevis-Anguilla National Bank**, labelled
   *"As reported by your bank just now."*
3. Say the line plainly: **CaribPay is not holding this money.** It is in Amara's
   bank account. We read it over the network when she looks, and we cache nothing.

**Act 2 — send by address.**

4. **Send** → tap **Devon** (or switch to *Address* and type `devon@caribpay`).
5. The **confirm screen** shows *Devon C.* at *National Commercial Bank Jamaica*,
   receiving JMD. Point out that a masked name is all the directory will give —
   never the account number, never a full legal name.
6. Confirm → enter **1500** → the live rate appears with a 60-second lock →
   **Review** → **Confirm & send**.

**Act 3 — the switch does its work.**

7. The status screen walks three steps: **Held at your bank** → **Clearing across
   the region** → **Delivered**.
8. "Held" is the honest word: the money is reserved at Amara's bank and has not
   moved. If the credit failed, it would be released in full.

**Act 4 — the recipient finds out.**

9. On Devon's device, **without touching anything**: the tab badge appears and
   the balance updates. The notification reads *"Money arrived — J$87,777.78 from
   Amara L."*
10. Devon's balance is now at **NCB Jamaica**, not with us.

**Act 5 — prove it.**

```bash
bun run settle
```

```
Cycle 2026-08-26 · St. Kitts-Nevis-Anguilla National Bank ↔ National Commercial Bank Jamaica
  1 transfer   gross EC$1,500.00
  NET: St. Kitts-Nevis-Anguilla National Bank owes the network       EC$1,500.00
  NET: National Commercial Bank Jamaica       is owed by network      J$87,777.78
  2 settlement instructions replace 1 correspondent hop.
```

Then:

```bash
bun run reconcile
```

Prints every bank's position against its prefunded cap, the switch's own FX
exposure, and confirms: every currency nets to zero, no cap breached, no transfer
stalled, **no hold stranded at any bank**. That last check is asked of the banks
over the network, not of our own tables.

---

## 3. The two questions judges ask

**"Where does the money actually sit?"**
At the member banks, always. Run this in front of them:

```bash
docker exec caribpay-postgres-1 psql -U caribpay -d caribpay -tAc \
  "SELECT table_name||'.'||column_name FROM information_schema.columns
   WHERE table_schema='public' AND column_name ILIKE '%balance%'"
```

It returns nothing. There is no column in the switch's database that holds a
customer balance, and a test in the suite fails if one is ever added. CaribPay is
a payment initiation and clearing operator, not an e-money issuer — no customer
funds, no safeguarding account, no float, and a materially lighter regulatory ask
to the ECCB than a stored-value wallet.

**"Who carries the risk between the instant credit and the netted settlement?"**
The payee's bank does, bounded by a prefunded cap. `bun run reconcile` prints
each bank's position against its cap. The switch's own FX book is on the same
screen: it runs long XCD and short JMD after a cross-currency transfer, and that
exposure is reported rather than hidden.

---

## 4. Two things worth doing on purpose

**Close the laptop mid-transfer.** Send, then kill the API process while the
status screen is still on "Clearing". Restart it. The recovery sweeper finds the
transfer and drives it **forward** to completion — past the credit the money has
irrevocably reached the payee, so there is nothing to roll back to. Most
prototypes fall over when you do this.

**Show a reversal.** Link the closed demo account (`NCB-ACCT-4009`) to a test
user and send to them. The hold is placed, the credit is refused, the hold is
released, and the payer's balance at their bank is exactly what it was. The
screen says *"Returned in full — no money left your account."*

---

## 5. Reset between runs

```bash
bun run db:seed:demo -- --reset   # the switch: users, addresses, links, ledger
bun run db:seed:bank              # the banks: balances back to opening, holds cleared
```

Run **both**. The two services own separate databases, and reseeding one without
the other leaves balances where the last run finished.

---

## 6. If something looks off

- **"They can't receive money yet"** — that person has an address but no connected
  bank account. Inherent to the model; connect one on their device.
- **Transfer stuck on "Clearing"** — check the mock bank is up
  (`curl localhost:3100/health`) and watch the API terminal. The recovery sweeper
  retries every 5 s regardless.
- **`reconcile` reports a stranded hold** — a transfer finished but its hold was
  never released. The sweeper should clear it; if not, the hold expires at the
  bank on its own within 5 minutes.
- **App can't reach the API** — phone on the same Wi-Fi, TCP 3000 open. Verify
  with `curl http://localhost:3000/api/v1/health`.
