# Ledger — Money OS

A personal money & portfolio tracker, rebuilt as a **Next.js 14 (App Router) + TypeScript** application from the original single-file HTML design.

Cash, cash flow, investments, rebalancing and macro — all in one screen, with a fully themeable dark UI (Space Grotesk + JetBrains Mono, lime accent) and everything persisted to the browser.

## Features

- **Dashboard** — net worth, equity curve, allocation donut, recent activity, spending by category, targeted savings.
- **Cash** — vaults (accounts), spending wallets, and portfolio capital, with transfers between any of them.
- **Cash Flow** — income deposits and categorized expenses (fixed / daily / misc), search, and savings goals.
- **Portfolio** (passcode-locked) with four tabs:
  - **PnL** — positions table with weights & unrealized PnL, plus a trade journal (win rate, profit factor).
  - **Orderbook** — committed trade orders with entry / TP / SL, risk-reward, and auto status.
  - **Rebalancing** — a *target book* you build yourself: named sleeves with their own weights
    and asymmetric buy / sell bands, optional per-asset targets, drift at both levels, and a
    plan that is priced and grouped by the account that has to execute it
    (see [`docs/rebalancing.md`](docs/rebalancing.md)).
  - **Macro** — not a market dashboard: what the world did to *this* book, in six panels —
    attribution of the last 30 days into saving vs currency, the USD/IDR curve against the rate
    you actually paid, the outside prices that touch a position you hold, a shock test that
    re-prices the book through the real rebalancing engine, your household currency mismatch and
    runway, and your own dated macro log measured since you wrote it
    (see [`docs/macro.md`](docs/macro.md)).
- **Live market data** — the Portfolio tab pulls real prices for every held asset (see below).
- **USD / IDR** currency toggle, **dark / light / midnight** themes plus a live color editor.
- **Quick Add** — one-tap preset buttons and recurring transactions that auto-log on schedule.
- **Accounts** — sign in with Google, or browse as a **guest**; the profile card above the Net
  Worth panel holds the feature switches and sign-out.
- **Optional features** — *Portfolio* and *FX effect* can each be switched off. Off means
  hidden, not deleted: positions, native currencies and FX cost basis keep being tracked, so
  switching a feature back on restores every number exactly.
- Signed in, the ledger is stored **on the server under the Google account id**, so the same
  books open on any device — and a new account starts on **empty books**. A guest ledger never
  leaves the browser.

## Sign in with Google

### 1. Create the OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and pick a project, or
   create one (*Select a project → New project*, any name).
2. **APIs & Services → OAuth consent screen.** Choose **External**, fill in app name and your
   own email, and save. While the app is in *Testing*, only accounts listed under
   **Audience → Test users** can sign in — add your Gmail there.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   **Web application**. Under *Authorized redirect URIs* add exactly:

   ```
   http://localhost:3000/api/auth/callback/google
   ```

   Add the deployed URL the same way (`https://your-domain/api/auth/callback/google`) when you
   host it. Nothing is needed under *Authorized JavaScript origins*.
4. Copy the **Client ID** and **Client secret**.

### 2. Point the app at it

`.env.local` already exists with a generated `NEXTAUTH_SECRET`. Paste the two values:

```
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
```

Restart `npm run dev` — env files are read at boot. The sign-in screen appears as soon as both
values are set; leave them empty and the app skips the gate entirely and runs as a single local
ledger, which is handy for development.

Two-step verification is the Google account's own — enable it at
[myaccount.google.com/security](https://myaccount.google.com/security). The app never stores
a second factor.

### 3. Where the data goes

`GET`/`PUT /api/state` reads and writes one JSON file per account under `.data/` (override with
`LEDGER_DATA_DIR`). The file name comes from the session, never from the request body, so a
client can only ever touch its own ledger — and `.data/` is gitignored.

`localStorage` stays on as a mirror: every change is written there first and shipped to the
server on a short debounce, so a dropped connection degrades to "still works, syncs later"
instead of losing the edit. The mirror is a *fallback*, never a source — a request that
succeeds with an empty body means the account genuinely has no ledger.

**Every ledger starts empty.** There is no demo data anywhere in the app, and nothing is
inherited from whatever this browser was holding: no accounts, zero balances, no transactions,
no positions. Only the scaffolding survives — the Fixed / Daily / Misc categories and the
USD→IDR rate history, which describe the world rather than your money (`createInitialState` in
[`lib/seed.ts`](lib/seed.ts)). Deleting an account's file under `.data/` is therefore a full
reset: the next sign-in opens on blank books and re-runs the setup wizard.

Note that a file store needs a writable disk — fine locally, on a VPS, or in Docker with a
volume, but **not** on Vercel/Netlify, whose filesystems are ephemeral. Hosting there means
swapping one adapter in [`lib/storage.ts`](lib/storage.ts) for a real database.

## First run — the setup wizard

Empty books can't be used, so [`components/Setup.tsx`](components/Setup.tsx) runs before the
shell and **cannot be skipped**. It creates the holders the rest of the app joins against, and
opens with a map of where money goes before asking for anything:

| | What it is | Required |
|---|---|---|
| **Vault** | The account income lands in. Big balance, rarely touched — you can't spend from it directly. | yes |
| **Wallet** | Spending money, filled by a vault → wallet transfer. Every expense comes out of one. | yes |
| **Capital** | Money at work: it buys positions and comes back when they're sold. | only if *Portfolio* is on |

Splitting them is what makes the numbers mean anything: one balance can't answer "what do I
have", "what may I still spend this month" and "what's invested" at once. Vault vs wallet turns
the spending limit into a real, visible number, and keeping capital apart stops price moves from
reading as income or expense.

The wizard's first step is the *Portfolio* and *FX effect* switches, and the rest of the form
follows them — with Portfolio off there is no capital step and no PIN, with FX off there are no
currency pickers and every holder is IDR. Opening balances are recorded as **opening balances**,
not income, so they never show up in this month's flow. It can be re-run later from the profile
sheet, where it only *adds* — it never deletes what's already there.

## Guest mode

The sign-in screen offers one way in without an account, and deliberately only one: the guest
ledger stays on this device (`localStorage`) and is still there tomorrow. A second, tab-lifetime
flavour existed briefly and was removed — two doors turned the first screen into a decision
instead of a way in. It is erased when you pick *Keluar & hapus data tamu* in the profile sheet,
which also offers to keep it.

A guest never calls `/api/state`. The only thing stored outside the page is a small
`ledgerGuest` cookie marking this browser as a guest, so a reload doesn't dump you back on the
sign-in screen — the books themselves are far too big for a cookie's 4 KB (a profile photo
alone can be ~900 KB). See [`lib/guest.ts`](lib/guest.ts).

Signing in with Google clears that cookie and opens your own empty ledger; guest data is left
where it was and never uploaded.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Build for production:

```bash
npm run build && npm start
```

The Portfolio tab is locked with the PIN set during setup — or **`1234`** if Portfolio was
switched off then. Change it via *Lock screen*.

## Live market data

When the Portfolio tab is unlocked it polls `/api/prices` every ~15s and updates each
position's price — driving Value / PnL / Weight, the ticker, and the best/worst cards.
A status pill (`LIVE · hh:mm:ss`) shows the last update.

| Asset class | Source | Key needed |
|-------------|--------|------------|
| Crypto (BTC, ETH, SOL…) | Yahoo Finance (`BTC-USD`) | No |
| Stocks / ETFs (AAPL, NVDA, VOO, SGOV…) | Finnhub if `FINNHUB_API_KEY` is set, else Yahoo Finance | Optional |

It works out-of-the-box with **no setup**. For real-time stock quotes, get a free key at
[finnhub.io](https://finnhub.io/register), copy `.env.local.example` → `.env.local`, paste the
key, and restart `npm run dev`. Fetching happens server-side in `app/api/prices/route.ts`, so
the key never reaches the browser. Adjust the interval with `NEXT_PUBLIC_PRICE_REFRESH_MS`.

> Note: the live feed overwrites a position's price each tick, so it supersedes any manual
> "Update market price" edits for held assets while the tab is open.

## Architecture

```
app/
  layout.tsx        Root layout + Google Fonts
  page.tsx          Renders <LedgerApp/>, passes authConfigured (force-dynamic)
  globals.css       The full design system (ported verbatim, CSS variables)
  api/auth/…        NextAuth (Google, JWT sessions, no database)
  api/state/        GET/PUT one JSON ledger per account under .data/
  api/prices/       Live quotes for held positions (Yahoo / Finnhub)
  api/fx/           Live USD→IDR rate
lib/
  types.ts          Domain types
  config.ts         Rate registry (spot + history), themes, storage key, color tokens
  seed.ts           Empty initial state (no demo data) + persisted-key list + migrations
  format.ts         Currency / date formatters, conversion helpers, sparkline path
  recurring.ts      Recurring-schedule math + trade-plan status
  rebalance.ts      The rebalancing engine: sleeves, bands, funding, lots, costs
  brokers.ts        Per-broker fees + final tax, used to price a plan
  quote.ts          Quote fetching shared by the price routes
  prices.ts         Client helper: symbols in, live prices out
  auth.ts           NextAuth config
  storage.ts        Adapter per user: browser store, or /api/state when signed in
  guest.ts          The ledgerGuest cookie
  image.ts          Avatar / cover downscale to a data URL
  store.ts          Zustand store: all state + every mutation/action
  derive.ts         Pure "renderVals" — computes every display value
components/
  LedgerApp.tsx     Shell, hydration, guest gate, theme application
  SignIn.tsx        The account gate; Setup.tsx  the mandatory first-run wizard
  TargetBook.tsx    The six-move rebalancing editor (wizard step + tab sheet)
  ProfileCard.tsx / ProfileSheet.tsx   Banner + every account control
  Topbar.tsx, Toast.tsx, ThemeDrawer.tsx, Modal.tsx, QuickAdd.tsx, EquityChart.tsx
  usePriceFeed.ts, useFxFeed.ts, useMarketProbe.ts   Polling hooks
  sections/         Dashboard, Cash, Flow, Portfolio
docs/
  rebalancing.md    Why the target book replaced the fixed cycle profiles
```

State lives in a single [Zustand](https://github.com/pmndrs/zustand) store. `derive(state)` is a pure function that turns raw state into all the formatted, ready-to-render values the components consume — keeping the components almost entirely presentational.
