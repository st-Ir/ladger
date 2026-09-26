# Macro — what the world did to your book

> **Status: rev 3 (2026-08-07). Shipped — all six panels are live.** Rev 1 proposed three
> panels — Drivers, Regime, Log — and they were not enough to carry a tab. *Where rev 1 was wrong*
> below keeps the reasoning, because the mistake is instructive and easy to make twice.
>
> The arithmetic is [`lib/macro.ts`](../lib/macro.ts) (panels 01, 02, 03, 05 + the log's join) and
> [`lib/shock.ts`](../lib/shock.ts) (panel 04), both pure and both verified against a worked ledger —
> the 30-day change reconciles to flow + FX exactly, and a pure rate shock leaves an IDX holding's
> rupiah value untouched. Around them: `app/api/macro/route.ts` (driver quotes + note baselines,
> cached 15 min), `components/useMacroFeed.ts`, `openNote`/`delNote`/`setShock` in the store, the
> note editor in `Modal.tsx`, and the panels in `Portfolio.tsx`. The fiction listed under *What
> comes out* is deleted.
>
> Verified in the running app against a furnished ledger: attribution splits +Rp8.0M into saving
> and a currency loss, the rate curve draws 48 points against an acquisition rate 1.4% above spot,
> four drivers earn rows (and no others), *crypto −30% · USD/IDR +8%* pushes Growth and Core out of
> band and prices the correction at 0.03%, and a note saved by hand shows its symbol's move
> immediately.

## What was there

The Macro tab was ten panels, and **every number in it was a literal typed into the source**. No
feed, no fetch, no state that could change any of them.

| # | Panel | Where the number comes from |
|---|---|---|
| 01 | Market Sentiment — composite gauge, 64 | `const senScore = 64` ([derive.ts:933](../lib/derive.ts#L933)) |
| 02 | Fear & Greed — gauge, 62 | `const fngVal = 62` |
| 03 | Global Snapshot — 5 stats incl. BTC dominance | `globalStats`, literals |
| 04 | Market Cap — crypto / equities / ETF AUM / bonds | `capData`, literals |
| 05 | Open Interest — $38.6B | `oiCard`, literals |
| 06 | 24h Volume — derivatives + spot | `derivVolCard` / `spotVolCard`, literals |
| 07 | Funding Rate — BTC/ETH/SOL/BNB | `funding`, literals |
| 08-09 | 24h price / volume distributions | `priceDistRaw` / `volDistRaw`, literals |
| 10 | Market News — 4 headlines with impact scores | `news` in [seed.ts:59](../lib/seed.ts#L59) |

**It is the last room in the app that still lies.** Every other invented number went on
2026-07-31; the equity curve now goes flat rather than draw a rally nobody had. **It is dated** —
headlines stamped July 2026 under sub-labels reading *Yesterday* and *Last week*. And **its
controls edit the fiction**: pin, Bull/Neutral/Bear and the filter all work, on made-up rows.

While counting: `strategies`, `planning` and `macro` are seeded at
[seed.ts:102-116](../lib/seed.ts#L102), derived, and **rendered by nothing** — the Strategy tab is
the orderbook. Three more blocks of invented copy that no one has ever seen.

## Why this isn't "wire up an API"

| Panel | Free source? |
|---|---|
| Funding, open interest, derivatives volume | Exchange APIs only. Binance is unreachable from this environment — established when the price feed was built, and why quotes go through Yahoo. |
| Equity + bond market cap | None. |
| 24h price / volume distributions | Needs a full market-universe scan. |
| Fear & Greed | **Yes** — `api.alternative.me/fng/`, no key, with history. |
| Crypto market cap + BTC dominance | **Yes** — CoinGecko `/api/v3/global`, no key. |

A faithful rebuild is impossible, and a partial one is the worst outcome: fake panels sitting
beside real ones, borrowing their credibility.

## Where rev 1 was wrong

Rev 1 answered that with Drivers (real quotes + the share of the book behind each), Regime (Fear &
Greed + dominance) and Log (your own notes, measured). Built as written, day one looks like this:

- **Drivers repeats two other tabs.** "18% crypto, 34% US" is already in the PnL weights column and
  in the Rebalancing sleeve tree. Strip the repetition and one row is genuinely new: the exchange
  rate. The rest is prices anyone can look up, wearing a weight you have already seen twice.
- **Regime is decoration.** Fear & Greed is a crypto index; dominance is a crypto ratio. Neither
  touches the book, and a panel that doesn't touch the book is the market dashboard this rework
  exists to close.
- **Log is empty on day one** and useful in month three.

One good panel, one ornament, one blank list. Not a tab.

The deeper mistake: rev 1 assumed macro is something that **arrives from outside**. For this app it
mostly doesn't. The ledger already holds a year of exchange rates, a full cost basis in two
currencies, every expense with its date and currency, and a pure rebalancing engine that will
happily price a portfolio that doesn't exist yet. The macro facts are in the building.

## The thesis

Macro is not "what is the market doing". It is **what the world does to this book** — and that has
three tenses, plus the part of your money that isn't a portfolio at all.

| Tense | Panel | Question |
|---|---|---|
| Already happened | 01 Attribution · 02 The rate you got | What actually moved my money, and did I convert well? |
| Happening | 03 Exposure | Which outside prices touch what I hold, right now? |
| Hasn't happened | 04 Shock test | If it moves, what breaks — and what does fixing it cost? |
| Standing | 05 Mismatch & runway | I earn in rupiah and save in dollars. How exposed is my *life*? |
| Written down | 06 Log | What I thought at the time, measured since. |

Panels 01, 02, 04 and 05 need **no external data at all**. The tab is full on day one, before
`/api/macro` exists.

## 01 · Attribution — what actually moved my money

Net worth went up. Because you saved, because prices rose, or because the rupiah fell? Three very
different facts, and only the first one is you.

**The math already exists.** [derive.ts:1236](../lib/derive.ts#L1236) already splits the 30-day
change into cash flow + FX effect; [1251-1259](../lib/derive.ts#L1251) already computes realized
FX, unrealized FX, and its split across cash and portfolio. All of it lives inside `title=`
attributes — **tooltips**. On a phone a tooltip cannot be opened at all, so the best numbers in the
app are, in practice, unreadable on the device most likely to open it.

So panel 01 is mostly a **promotion, not a computation**: the decomposition at full size, in
rupiah, realized separated from unrealized, with the cash and portfolio legs shown rather than
concatenated into a hover string.

Its honest limit is already written in the code: *"harga pasar portofolio dianggap tetap — tidak
ada riwayat harga tersimpan"* ([derive.ts:1240](../lib/derive.ts#L1240)). Without stored price
history, the price leg is truthful since a position was opened, not month by month. The panel says
so on its face rather than in a tooltip.

## 02 · The rate you actually got

`rates[]` holds a year of USD/IDR — seeded Oct 2025 onward, extended every time a live quote is
adopted ([store.ts:1298](../lib/store.ts#L1298)) — and **has never been drawn**. Its only consumer
today is `points: rates.length` in a chip tooltip ([derive.ts:1087](../lib/derive.ts#L1087)).

Draw it, and lay one horizontal line across it: **your average acquisition rate**,
`fxCostIdr / usdHeld`, already computed as `cashRate()` in [store.ts:104](../lib/store.ts#L104).
The gap between the line and the curve is the whole answer to "did I buy dollars well or badly",
and it is a fact, not an opinion.

What can't be drawn: **the individual conversions**. There is no `Transfer` type and no transfer
log — cross-currency moves accumulate into the scalar `realizedFxIdr` and vanish as events. Marking
"you converted here, at this rate" requires starting to record transfers, which is a separate
decision with its own storage cost. Not smuggled in here.

## 03 · Exposure that pays rent

The surviving third of rev 1's Drivers. Every ticker goes through `yahooPrice()`
([quote.ts:33](../lib/quote.ts#L33)), which takes any Yahoo symbol — a new route over an old
function, not a new integration.

| Driver | Ticker | Touches |
|---|---|---|
| Rupiah vs dollar | `IDR=X` | Every USD holder and every US-listed position |
| Bitcoin | `BTC-USD` | Crypto positions |
| US market | `^GSPC` | US-listed stocks and ETFs |
| Indonesian market | `^JKSE` | `.JK` positions |

**A driver earns its row by touching a position.** No IDX holdings, no IHSG row. DXY, the 10-year
and gold connect to nothing in the ledger, so they don't appear; buy gold and `GC=F` shows up the
same day. This rule is the whole discipline of the panel.

And the asymmetry that keeps it honest: **currency is exact** — a 1% move in USD/IDR moves the
rupiah value of the USD side by exactly 1% of it, so it can be shown as money. Everything else gets
the driver's own move and the weight behind it, and stops. No implied portfolio delta, because that
needs beta, and beta needs history this app doesn't store.

## 04 · Shock test — the centrepiece

The panel rev 1 was missing, and the one that justifies the tab.

The user picks the shock: *crypto −20%*, *US −10%*, *USD/IDR +8%*. The app does not forecast, score
or assign a probability. It re-values the book and answers four questions no other tab can:

1. **Net worth after**, split by leg, in rupiah.
2. **Which sleeves leave their bands** — and this is nearly free, because
   `rebalance(input)` in [rebalance.ts:222](../lib/rebalance.ts#L222) is pure and takes
   `positions`, `rate` and `prices` as inputs. Shocking is `{...p, cur: p.cur * (1 + shock)}` and a
   bumped rate, then running the same engine that draws the real plan. The hypothetical is computed
   by the production code path, not a parallel approximation.
3. **Can cash still fund it** — with `cashFirst` on, does idle capital cover the buys the shock
   creates, or does the correction have to reach into a trim? That's `RebalGap` already, and it is
   the real question a drawdown asks: *is the buffer big enough to buy the dip I keep saying I'd
   buy?*
4. **What the correction costs** — fees plus Indonesian final tax, priced through
   [brokers.ts](../lib/brokers.ts), exactly as the live plan is.

The framing rule, and it belongs on the card: **you supply the shock, the app supplies the
arithmetic.** No likelihoods, no historical scenario library ("repeat of March 2020"), no implied
correlation between the three sliders — moving crypto alone leaves equities where they are, which
is unrealistic and *honest about being unrealistic*. It is a mechanism check, not a forecast.

## 05 · Mismatch & runway

The portfolio is not the exposure. A person earning rupiah, spending rupiah and saving dollars is
running a currency position whether or not they think of it that way, and the ledger has every
input: `incomes` and `expenses` carry `currency` and `date`, holders carry theirs.

Two numbers:

- **Mismatch** — share of income in IDR, share of spending in IDR, share of assets in USD, on one
  line. It is the household version of a currency book, and it is the number that decides whether a
  weakening rupiah is a windfall or a squeeze for *you*.
- **Runway** — free cash ÷ average monthly spend, in months, plus how the shock from panel 04 moves
  it. "Buku turun 12%" is abstract; "runway 9 bulan → 11 bulan karena tabunganmu dalam dolar" is
  the same fact in the unit a person actually feels.

This panel is also the honest answer to *why an Indonesian ledger has a macro tab at all*.

## 06 · Log

Market News becomes your own macro log, absorbing the orphaned `macro[]` — always the same object.

```ts
interface MacroNote {
  id: string;
  date: string;            // when written — the measurement baseline
  title: string;
  source?: string;
  read: Sentiment;         // your call, labelled as yours
  body?: string;
  syms: string[];          // only symbols you actually hold
}
```

The app scores nothing; it **measures**. For each tagged symbol it shows the move since `date`,
from the Yahoo chart endpoint the quote path already calls (`range=2d` → `range=3mo`). That
replaces `impact: 84` with *you wrote this on 11 Jul; BTC is +2.4% since*. Once reads are dated and
outcomes measured, the log can show how often your macro calls were right — the same payoff the
trade journal already earns. An invented impact score earns nothing.

## Deferred: Regime

Fear & Greed (with its 30-day history) and BTC dominance are free, real and easy. They are also
crypto-only and touch nothing in the book. If they ship, they ship **last, below the fold, labelled
as a crypto index rather than a reading of your portfolio**, and only when crypto is actually held.
The composite sentiment gauge is not rebuilt at all: its three inputs are Price, Breadth and
Funding, and the app has none of the last two. A score with no inputs is worse than a missing panel.

## Deliberately not built

- **Beta and correlation.** They need a daily series of portfolio value, which isn't stored — and
  `eq[]` in `derive.ts` is invented monthly history, so it cannot be borrowed. Storing a real daily
  snapshot is a separate, larger decision about what this app keeps.
- **Probabilities on the shock test.** "20% chance of a 20% drawdown" would be a number with no
  source. The slider stays the user's assumption.
- **Historical scenario presets.** Replaying 2008 or March 2020 implies the app knows how *your*
  holdings behaved then. It doesn't.
- **A news feed.** It would make Ledger a reader with a portfolio attached, and the entries would be
  someone else's picks. Typing a note by hand is the friction that makes it yours.
- **Per-conversion markers on the rate curve.** Requires a transfer log that doesn't exist yet.
- **Funding, OI, derivatives volume, market caps, distributions.** No free source, and nothing in
  the book is exposed to them.
- **Any recommendation.** The tab reports what moved, what is exposed, and what breaks. What to do
  about it is the rebalancing tab's job, where the user's own targets and bands decide.

## What comes out

Roughly 440 lines, verified as unreferenced elsewhere:

| File | Delete |
|---|---|
| `lib/derive.ts` | 918-996 (`mkGauge`, `senScore`, `fngVal`, `capData`/`capRows`, `globalStats`, `oiCard`, `derivVolCard`, `spotVolCard`, `funding`, `priceDist`, `volDist`) · 997-1039 (`badgeByTag`, `sentMeta`, news mapping) · 1040-1044 (`macro`) · 718 (`strategies`) · the matching return fields at 1341-1357, 1370-1371 · the `bigM` import |
| `components/sections/Portfolio.tsx` | `Macro`, 631-825 |
| `lib/types.ts` | `news`/`newsFilter`/`strategies`/`planning`/`macro` state fields · `NewsItem`, `NewsAsset`, `Strategy`, `Planning`, `Macro`. Keep `Sentiment` — `MacroNote.read` reuses it |
| `lib/seed.ts` | the four seeded blocks (58-116) · `"news"` from `PERSIST_KEYS` |
| `lib/store.ts` | `toggleNewsPin`, `scoreNews`, `setNewsFilter` (968-976) and their declarations (231-233) |
| `app/globals.css` | 127-156, 827-831, `.pfb2`/`.pfbm`. **Keep** `.bar`/`.barf`, `.ftab`/`.fbtn`, `.marks`, `.big`, `.omk`, `.bband`, `.pfb3` — all used by other sections |
| `lib/format.ts` | `bigM` (136) — unless Regime ships, which needs it for market cap |

`strategies`, `planning` and `macro` were never in `PERSIST_KEYS`, so they vanish without trace.
`news` was, so a dead key stays in `.data/<sub>.json` and in localStorage; `hydrate()` only reads
keys on the list, so no migration is needed.

## Files this touches

| File | Change |
|---|---|
| `lib/types.ts` | `MacroNote`, `Driver`, `Shock`; drop the five obsolete types |
| `lib/seed.ts` | remove the four seeded blocks; `mlog: []`; persist-key swap |
| `lib/macro.ts` *(new)* | attribution split, exposure per driver, mismatch + runway — pure |
| `lib/shock.ts` *(new)* | apply a shock to positions + rate, hand the result to `rebalance()` |
| `app/api/macro/route.ts` *(new)* | driver quotes (+ Fear & Greed if Regime ships), cached 15 min |
| `components/useMacroFeed.ts` *(new)* | poll, gated on the Macro tab being open, plus a refetch when the ask changes |
| `lib/prices.ts` | `fetchMacro` + `macroKey` — what the tab asks for, and its signature |
| `components/Modal.tsx` | the note editor; symbols are picked from holdings, never typed free |
| `lib/derive.ts` | delete the fiction; format the six panels |
| `lib/store.ts` | `addNote`/`editNote`/`delNote`, `setShock`; drop the three news actions |
| `components/sections/Portfolio.tsx` | `Macro` rebuilt, ten panels → six |

## Open questions, as answered by building it

1. **Does panel 01 survive with FX off?** Yes, as one panel. Both ends of the window are valued at
   the same rate, so the revaluation leg is zero *by construction* rather than by assertion
   ([macro.ts:328](../lib/macro.ts#L328)) and the leg simply isn't drawn. What is left reads as
   saving, which is still a real answer to "why did net worth move".
2. **How many shock sliders?** Three, and each appears only if the book contains something it
   moves — no crypto, no crypto slider; FX off, no rate slider
   ([derive.ts:1062](../lib/derive.ts#L1062)). A book of one asset class gets one slider, which is
   the mechanism check at its smallest rather than a control panel at its emptiest.
3. **Where does runway belong?** Both, split by tense: the standing number is panel 05, its
   *reaction* to the shock is a row inside panel 04. A weaker rupiah shortens the runway from both
   ends — dollar assets buy more months, dollar spending costs more rupiah — and
   [`shock.ts:177`](../lib/shock.ts#L177) prices both rather than flattering the answer.
4. **How far back does the log measure?** The range is picked from the note's own age — `1mo`
   through `2y` ([quote.ts:64](../lib/quote.ts#L64)) — so an old note isn't silently measured from
   the start of a too-short series. Nothing that far back returns null, and the tag keeps its
   symbol and loses its number.

One question the build added: **a note is a request for a number, and a 15-minute timer answers it
late.** A fresh note showing a dash reads as *the venue had nothing*, not as *nobody has asked
yet* — so the feed also watches what it would ask for (`macroKey` in
[`lib/prices.ts`](../lib/prices.ts)) and refetches when that changes: a new note, a new tag, or the
first position in an asset class, which brings its driver along. The route's per-ticker cache means
the extra call is one round trip and no venue hit for anything already known.
