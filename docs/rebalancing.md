# Rebalancing — the target book

> **Status: built (2026-08-06).** The engine lives in [`lib/rebalance.ts`](../lib/rebalance.ts) and
> the old fixed model is gone from [`lib/derive.ts`](../lib/derive.ts). *What's there now* below is
> kept as the record of what was replaced. Three things came out differently from this text; they
> are called out in **Where the build differs** at the end.

## What was there before

The Rebalancing tab measures the portfolio against four hardcoded asset classes and three
hardcoded cycle profiles. The numbers in [`lib/seed.ts`](../lib/seed.ts) are **one person's
strategy**, shipped as everyone's default:

| Limit | Where |
|---|---|
| Exactly four classes: `crypto`, `stock`, `etf`, `hedge` | `PosType` in `lib/types.ts` |
| `hedge` is labelled *SGOV Hedge* — one specific ticker | `clsLabel` in `lib/derive.ts` |
| Exactly three cycles, named Bull / Neutral / Bear | `CycleProfiles` in `lib/types.ts` |
| Targets are per class only — no way to say "BTC 20%, ETH 10%" | `cycleProfiles[cycle][k]` |
| Tolerance fixed at ±2 pp | `Math.abs(drift) < 2` |
| The plan ignores free capital, fees and tax | `rebalMoves` |
| The plan is advice — no way to act on it | no handler on the rows |

Everything below removes those.

## The big idea — a sleeve is a role, not an asset class

The current model asks *what is this?* (crypto, stock, ETF, hedge). The answer is a fact about the
instrument, and facts about instruments don't tell you how much to hold. The new model asks *what
is this for?* — and that question has only ever had three useful answers:

| Sleeve | What it is for | Turnover | Band |
|---|---|---|---|
| **Core** | The part that is not being traded. It exists to compound, and the reason to touch it is a change of mind, not a change of price. | lowest | widest |
| **Growth** | The part deliberately taking risk. Drift here is the drift that actually matters, because it is where a good run quietly turns into a concentrated bet. | highest | tighter |
| **Buffer** | The part that must still be there when everything else is down — cash equivalents. It is what makes buying a drawdown possible instead of theoretical. | on demand | tightest |

Three is a starting point, not a rule. Sleeves are created, renamed, merged and deleted by the
user; someone who wants five, or two, or the old four asset classes back, builds exactly that.
The names above are what the wizard offers on a blank book, nothing more.

Roles are also what make the bands defensible. A wide band on Core is correct — it is supposed to
sit still. A tight band on Buffer is correct — a defensive sleeve that has quietly drained is not
a defensive sleeve. Under the old model, where every class was the same kind of thing, one ±2 pp
for all four was the only honest option available.

## Classification: suggested, never applied

The app recommends **where a position belongs**. It does not recommend **how much to hold** — no
suggested weights, no model portfolio, no ranges nudging toward one answer. Weights are the part
that depends on things the ledger cannot see, and a default there would be the same mistake as
shipping one person's cycle profiles to everyone.

What it does know is each position's `type` and `market`, so it suggests on that alone:

| The app sees | Suggests | Reasoning shown to the user |
|---|---|---|
| `hedge` | Buffer | A cash equivalent is only useful as a buffer. |
| `etf` | Core | A broad basket is the archetypal hold-and-forget position. |
| `stock` | Core | Single names bought through a broker are usually held, not traded. |
| `crypto` | Growth | The most volatile class in the ledger — treating it as core hides real risk. |

Every suggestion renders as a dashed chip with an accept and a change control, and every one is
free to be wrong: `stock` → Growth for someone who trades single names, `crypto` → Core for
someone whose BTC is their longest-held position. The mapping is a rule of thumb about
volatility, printed with its reason so it can be argued with — not advice, and never applied
silently.

Two consequences worth keeping:

- **Nothing is auto-filed.** A position with no sleeve sits in *Unassigned* with its real weight
  showing. A rebalancer that quietly guesses is a rebalancer that lies.
- **Suggestions never re-run.** Once a position is filed, later type changes or new heuristics
  leave it alone. The user's answer outranks the app's guess permanently.

## The model

Three levels, all user-owned.

```ts
/** One saved copy of the whole book. Replaces `CycleProfiles`. */
interface Preset {
  id: string;
  name: string;          // the user's word — "Neutral", "Musim dingin", anything
  sleeves: Sleeve[];
}

/** Two tolerances, because topping up and trimming are not the same price. */
interface Band {
  buy: number;           // pp below target before a buy is proposed
  sell: number;          // pp above target before a sell is — wider, by default
}

/** A named bucket. Any number of them; weights must total 100. */
interface Sleeve {
  id: string;
  name: string;
  color: string;
  target: number;        // % of the portfolio
  band: Band;
  /** How positions land here: by ticker, or by the type they already carry. */
  match: { kind: "syms"; syms: string[] } | { kind: "type"; type: PosType };
  /** Optional second level. Empty = the sleeve is balanced as one lump. */
  targets: AssetTarget[];
}

/** A target inside a sleeve. Weights are relative to the sleeve, not the portfolio. */
interface AssetTarget {
  sym: string;
  target: number;        // % of the sleeve
  band?: Band;           // inherits the sleeve's when unset
  lock?: "hold" | "no-sell" | "no-buy";
}
```

Weights being relative inside a sleeve is what makes this editable in practice: retuning Core
from 60/40 to 70/30 never touches Growth or Buffer, and the sleeve totals still add to 100.

A position matched by no sleeve is not silently dropped — it shows in an **Unassigned** row with
its real weight and a prompt to file it. Positions the book doesn't know about are the main way a
rebalancer lies to you.

## The engine

Ordered, and the order is the point.

**1 · Drift vs an asymmetric band.** For every node, `drift = now% − target%`, and the band it is
measured against has two sides:

```ts
band: { buy: number; sell: number }   // pp below target, pp above target
```

Correcting an underweight costs a buy fee. Correcting an overweight costs a buy fee *plus* the
0.1–0.21% final tax in [`lib/brokers.ts`](../lib/brokers.ts). The two are not the same price, so
they cannot share one tolerance: the sell side is the wider one, by default and by construction.
`Core 40% · buy −2 / sell +5` says *top me up early, trim me late*, which is what the tax
schedule actually implies. Symmetric bands are still available — set both sides equal — but they
are a choice, not the default.

**2 · Cash first, in the account that can spend it.** Free balance in a capital account buys the
underweights that live in *that same account* before any sell is proposed. Rebalancing with new
money pays a buy fee and **no tax at all**; reaching for a sell while cash sat right there burns
0.1–0.21% for nothing. Cash in a *different* account is offered next, as a funding option rather
than an automatic one, because getting it there means a transfer (see *Execution reality*).

**3 · Sell the remainder.** Only what cash could not cover, from the most-overweight node first,
never from a node marked `no-sell`, and preferring an overweight in the same account as the
underweight so the proceeds don't have to travel.

**4 · Round to what can actually be traded.** A rupiah amount is not an order. IDX stocks trade
in lots of 100 shares, so an IDX move is rounded **down** to whole lots — under-correcting is
safe, over-correcting is not, and the leftover stays inside the band by construction whenever the
band is wider than one lot. Crypto is fractional and gets rounded only if the venue's minimum
order size has been recorded. A move smaller than one tradable unit is not silently dropped; it
is listed with the reason and its lot price.

**5 · Plan, with the bill shown.** Every move is priced through `feeFor` and `feeNote` — real
broker schedule, real final tax — and the plan carries a total: *"4 moves · Rp61.400 · 0.09% of
portfolio"*. Nothing is suppressed for being expensive. The band already decided what is worth
correcting; the engine's remaining job is to make the price impossible to miss, not to overrule
the user with a threshold. Every row opens the existing Buy/Sell modal prefilled with symbol,
amount and source capital.

### Why there is no cost gate

An earlier draft dropped any move whose cost exceeded a fraction of the move size. That rule does
nothing. Broker fees are proportional, so `cost ÷ move size` is a constant — 0.41% at Indodax on
a sell, whatever the size — and the test either passes for every move at that venue or fails for
every move. The intuition behind it was sound (don't pay real money to fix imaginary drift) but
the lever was wrong: the thing that decides whether a correction is worth its cost is the band,
and the band is already there. Two rules competing to suppress the same move is one rule too
many.

The only size-based rule that survives is **feasibility**, in step 4 — a move below one lot isn't
expensive, it's impossible.

## Execution reality

Three things stand between a correct plan and an executable one.

**Moves belong to accounts, not to sleeves.** Every position carries `src`, the capital account
that funded it, so every move inherits one. The plan is therefore grouped by capital account, and
within an account a sell genuinely funds a buy. Across accounts it does not: *trim Core at
Stockbit → buy Growth at Indodax* is three steps, and the plan says so, emitting the transfer as
its own row rather than pretending the money teleports. Cross-account rows are marked, because
they settle slowly and can't be done in one sitting — and when the two accounts hold different
currencies the transfer converts at a rate that is its own small cost. An underweight in an
account with no cash and no overweight reads *"needs Rp X in Trading Capital"*, which is a
fundable problem, instead of a sell proposed somewhere unrelated.

**A plan on dead marks is worse than no plan.** Weights come from `cur`, and the app already
knows when that number is untrustworthy: `pricesAt`, `priceBadge`, and the `missing` list in
[`lib/derive.ts`](../lib/derive.ts). When the feed is offline or a position in the book has no
live price, the table still renders — last-known weights are informative — but execution is
disabled and the stale names are called out. Information yes, action no. Note that *delayed* is
not *stale*: IDX quotes are delayed by design and the app tracks that separately as
`stockDelayed`. Delay is a known offset; staleness is an unknown one.

**An empty plan has three meanings, and they must not look alike.**

| State | What it means | What it shows |
|---|---|---|
| On target | Every node inside its band | The current checkmark |
| Not tradable | Moves exist, all below one lot | The moves, greyed, with the lot price |
| Not priced | Feed offline or names missing | The table, with execute disabled |

The old design collapsed the middle case into the first, so a small book would have reported
"nothing to rebalance" forever while quietly drifting.

## Drift you didn't cause

Hold a US ETF and an IDX stock, let USD/IDR move, and every weight in the book changes without a
single trade. Left alone, the plan would then charge final tax to undo a currency move.

Weights are computed **at spot**, which is not a new rule — it is the one the ledger already
applies to balances, and positions are balances. What gets added is a decomposition: alongside
each sleeve's drift, the share of it attributable to FX, obtained by revaluing the book at the
rate stored when the preset was last saved. The rate history that makes this possible is already
there (`fx.points`, `rateAsOf`).

It is shown, and nothing more. Excluding FX drift automatically would be the app deciding that a
currency move isn't a real change in what you own, which is a position the user is entitled to
disagree with — the point is only to let them recognise *"this drift isn't mine"* and widen a
band or wait, rather than pay to reverse it. With the FX effect switched off the book is
single-currency, the decomposition is zero, and the whole thing disappears.

## Deliberately not built: tax-lot selection

Nothing here picks which lot to sell — no FIFO, no HIFO, no holding-period logic. Indonesian
final tax is charged on **gross transaction value**, not on gain, so the lot sold changes the tax
bill by exactly nothing. This is the reason the cost model in step 5 can be as simple as it is,
and it is written down here so that a future reader doesn't mistake the omission for an oversight
and add machinery that cannot pay for itself.

## Setting it up

A **Target book** step, after the capital step in the wizard, and re-openable from the
Rebalancing tab. Six moves, in this order.

**1 · Name the sleeves.** A blank book opens with Core, Growth and Buffer already named, with
their roles written next to them and their weights **empty**. Rename, merge, split, add or delete
freely — someone who wants the old four asset classes builds them here in a minute.

**2 · Set the weights.** One number per sleeve, all typed by the user. A running total is shown
and the step will not advance until it reads 100%, which is the only opinion this screen holds.
Nothing is prefilled, and current holdings are not offered as a starting point — reading today's
accident back as today's target is how a drift you never chose becomes the plan.

**3 · Set the bands.** Two numbers per sleeve, buy side and sell side, prefilled from the role
(Core widest, Buffer tightest) with the sell side already the wider of the two. The step explains
the asymmetry once, in one line — *trimming pays tax, topping up doesn't* — and offers a control
to lock them equal for anyone who wants the textbook version.

**4 · File the positions.** Each holding arrives with a dashed suggestion from the table above,
its reason attached, and two controls: accept, or pick a different sleeve. Filing works by ticker
for precision or by type for a whole class at once. Anything left unfiled lands in *Unassigned* —
allowed, and visible, never guessed at.

**5 · Asset targets, optional.** Inside any sleeve, split it further: `BTC 60% / ETH 40%`. Left
empty, the sleeve is balanced as one lump. This is the step that answers "I want to change every
asset", and it is skippable so it never blocks a simple book.

**6 · Save as a preset.** The book gets a name. Add more presets later for different market
views; switching presets swaps the whole book, not just four numbers.

One portfolio-wide setting sits alongside, defaulting to on: **cash first**. Turning it off makes
the engine behave like a textbook rebalancer, selling into an underweight even with money idle in
the account — worth having, worth not defaulting to.

### Worked example

*The numbers below are the engine's actual output, not hand arithmetic.*

A Rp 100.000.000 book, `Core 40% (−2/+5) · Growth 35% (−3/+6) · Buffer 25% (−1/+3)`, Core split
`BTC 60 / ETH 40`. Growth is one crypto name and Buffer is an IDX ETF at Rp 4.600 (1 lot =
Rp 460.000). BTC, ETH and Growth trade at Indodax, where Rp 4.000.000 sits idle; Buffer is at
Stockbit, which has none.

| Node | Now | Target | Drift | Outcome |
|---|---|---|---|---|
| Core | 44% | 40% | +4.0 | inside the +5 sell band → **no trim**, tax not paid |
| ↳ BTC | 70% of sleeve | 60% | +10.0 | past the sell side → trim to target, Rp 4.400.000 |
| ↳ ETH | 30% of sleeve | 40% | −10.0 | past the buy side → buy Rp 4.400.000 |
| Growth | 33% | 35% | −2.0 | inside the −3 buy band → no move |
| Buffer | 23% | 25% | −2.0 | past the −1 buy band → buy Rp 2.000.000 |

The asymmetry earns its keep in the first row: a symmetric ±3 would have proposed a Rp 4.000.000
trim of Core and paid final tax on it, when the sleeve is only overweight because it performed.

The plan, grouped by the account that has to execute it:

```
[Indodax]   BUY  ETH   Rp4.400.000   fee Rp8.800
            SELL BTC   Rp4.400.000   fee Rp18.040   incl. 0.21% final tax
[Stockbit]  BUY  BUFF  Rp1.840.000   fee Rp2.760    [cross]  sisa Rp160.000
            TRANSFER   Indodax → Stockbit Rp2.000.000
4 langkah · Rp29.600 · 0.030% dari portfolio
```

ETH's Rp 4.400.000 is paid for by the Rp 4.000.000 of idle cash plus Rp 400.000 of the BTC
proceeds, so no *extra* selling happens to fund it. Buffer's buy is an IDX name: Rp 2.000.000 buys
4 lots, and the Rp 160.000 that won't fill a fifth is reported rather than quietly dropped. It sits
at Stockbit with no cash of its own, so the remaining BTC proceeds travel there as their own
transfer row.

### What `cash first` is worth

Same book, switch off:

```
[Indodax]   BUY  ETH   Rp4.400.000   fee Rp8.800
            SELL BTC   Rp6.400.000   fee Rp26.240   incl. 0.21% final tax
[Stockbit]  BUY  BUFF  Rp1.840.000   fee Rp2.760    [cross]  sisa Rp160.000
            TRANSFER   Indodax → Stockbit Rp2.000.000
4 langkah · Rp37.800 · 0.038% dari portfolio
```

The same four rows, and Rp 4.000.000 still sitting idle. The BTC trim has grown from Rp 4.400.000
to Rp 6.400.000, because Buffer is now funded by reaching into a Core overweight the band was
content to leave alone. **Rp 8.200 of pure final tax, paid to avoid spending money that was already
there** — which is the entire argument for the default, priced.

## What happens to existing books

`cycleProfiles` migrates on first load: each of the three profiles becomes a preset holding four
sleeves matched `by type`, carrying the same percentages, with today's ±2 pp arriving as a
symmetric `{ buy: 2, sell: 2 }` rather than silently widening on someone's behalf. Nothing is
deleted and no one loses their targets — a user who never opens the new step sees the same
targets they see today, with the cash-first, lot-rounding and cost-disclosure improvements
applied to the plan.

## Files this touches

| File | Change |
|---|---|
| `lib/types.ts` | `TargetBook` / `Sleeve` / `Band` / `AssetTarget`; `cycle` + `cycleProfiles` → `books` + `bookId` + `cashFirst` |
| `lib/seed.ts` | `migrateBooks()` from `cycleProfiles`; new persist keys |
| `lib/rebalance.ts` *(new)* | the five-step engine, pure, priced through `lib/brokers.ts`; owns lot rounding and the per-account grouping |
| `lib/derive.ts` | `rebalRows` / `rebalMoves` / `rebalGroups` format the engine's output; nothing is computed inline |
| `lib/store.ts` | `saveBook` / `delBook` / `setBook` / `fileSymbol` / `toggleCashFirst`; `execMove` prefills Buy/Sell/Transfer |
| `components/TargetBook.tsx` *(new)* | the six-move editor, shared by the wizard step and the tab's sheet |
| `components/sections/Portfolio.tsx` | sleeve tree, unassigned row, plan cost, execute buttons |
| `components/Setup.tsx` | the target-book step |

## Where the build differs

Three deliberate departures from the text above.

**1 · `books` / `bookId`, not `presets` / `presetId`.** `Preset` was already taken — it is the
quick-add / recurring-transaction type in `lib/types.ts`, and `presets` is already a state key. Two
unrelated things called *preset* in one store is a bug waiting to be written, so the saved copy of
the book is `TargetBook` and the state keys are `books` / `bookId`. The word *preset* survives in
the UI, where there is no ambiguity.

**2 · A correction goes to the target, not to the edge of the band.** An earlier draft of the
worked example implied trimming only the excess beyond the band, while its `Buffer` row corrected
the full gap; the prose settles it — *"the band already decided what is worth correcting"*. The
band is a **trigger**, and once it fires the node is corrected all the way back to target. The
worked example above has been recomputed from the engine accordingly.

**3 · Extra selling is what `cash first` switches off — nothing else.** "Sell the remainder, from
the most-overweight node first" could be read as always reaching into a node that is overweight but
still *inside* its band. It isn't read that way by default: with `cash first` on, funding is cash
then the trims the bands already produced, and a buy neither can cover is reported as *"butuh
Rp X di &lt;akun&gt;"* rather than answered with a sell the book said to leave alone.

Reaching into those spared overweights is exactly what switching `cash first` **off** buys you —
the textbook rebalancer the setup section describes. This mattered more than it looks: with the
default reading applied to both settings, the toggle changed which pot paid but never changed a
single row, so the plan came out byte-identical either way. A switch that costs the user real final
tax has to be able to show them what it costs, which is what *What `cash first` is worth* above now
does.
