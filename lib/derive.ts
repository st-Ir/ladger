import { THEMES, TOKEN_LABELS, TODAY, currentRate, rateAsOf } from "./config";
import { convert, fdate, fmtIn, fmtRate, makeFormat, parseAmount, parseDate, spark } from "./format";
import { nextRunStr, scheduleText } from "./recurring";
import { BROKERS, brokerById, feeFor, feeNote, feeRate } from "./brokers";
import { rebalance } from "./rebalance";
import { macro, measureNotes } from "./macro";
import { shockTest } from "./shock";
import type { Cur, Features, LedgerState, ThemeColors } from "./types";

/**
 * Pure derivation of every display value the UI needs — a faithful port of the
 * original `renderVals()`. Returns data only; event handlers come from the store.
 */
export function derive(S: LedgerState) {
  // Optional halves of the app. Nothing here deletes or rewrites data — a feature
  // that's off is simply left out of the view, so flipping it back on restores it.
  const feat: Features = S.features || { portfolio: true, fx: true };
  // FX off = a single-currency ledger. Everything is reported in IDR (the
  // functional currency) regardless of what the USD/IDR toggle was last left on.
  const dispCur: Cur = feat.fx ? S.cur : "IDR";
  const fm = makeFormat(dispCur);
  const F = fm.fmt;
  const fmt2 = fm.fmt2;
  const sfmt = fm.sfmt;
  const toUsd = fm.toUsd;

  // Multi-currency: every holder/transaction stores a native amount + currency.
  // Aggregation converts each native amount to USD (the internal base) first,
  // then sums — never adds different currencies raw. `uc` = native → USD; a
  // missing currency is legacy data treated as USD. Positions are USD-priced.
  const rate = currentRate();
  const uc = (amount: number, cur?: Cur) => convert(amount, (cur || "USD") as Cur, "USD", rate);
  // Balances are worth what they're worth today (`uc` → USD base at spot, then
  // `F` to the display currency). Flows are measured at the rate of their own
  // date and reported at that same rate (`dc` → straight to the display
  // currency, formatted with `FC`) — routing them through spot would restate
  // history: a Rp15,000,000 salary must stay Rp15,000,000 forever.
  const dc = (amount: number, cur: Cur | undefined, date: string) =>
    convert(amount, (cur || "USD") as Cur, dispCur, rateAsOf(date));
  /** A USD-base figure re-expressed in the display currency (spot). */
  const toDisp = (usd: number) => convert(usd, "USD", dispCur, rate);
  const FC = fm.fmtC;
  const sfc = fm.sfmtC;

  const activeColors: ThemeColors = {
    ...(THEMES[S.theme] || THEMES.dark),
    ...((S.overrides || {})[S.theme] || {}),
  };

  const totalCash = S.wallets.reduce((a, w) => a + uc(w.bal, w.currency), 0);
  const totalBank = S.accounts.reduce((a, x) => a + uc(x.bal, x.currency), 0);
  const totalCapital = (S.capital || []).reduce((a, c) => a + uc(c.bal, c.currency), 0);
  const pfValue = S.positions.reduce((a, p) => a + p.cur * p.qty, 0);
  const pfCost = S.positions.reduce((a, p) => a + p.avg * p.qty, 0);
  const pfPnl = pfValue - pfCost;
  // With investments off, net worth is cash only. Capital holders still count —
  // they're cash set aside, and they keep their row in the Cash section.
  const netWorth = totalCash + totalBank + totalCapital + (feat.portfolio ? pfValue : 0);

  // Unrealized FX (functional IDR): held foreign value at spot − its IDR cost basis.
  // Cash: USD balances vs fxCostIdr. Portfolio: USD cost at spot vs pfCostIdr (the
  // FX slice of the portfolio's gain; the asset slice is pfPnl in USD).
  const usdCashHeld = [...(S.accounts || []), ...(S.wallets || []), ...(S.capital || [])].reduce((a, x: any) => a + (((x.currency || "USD") === "USD") ? x.bal : 0), 0);
  const unrealCashIdr = usdCashHeld * rate - (S.fxCostIdr || 0);
  const unrealPfIdr = pfCost * rate - (S.pfCostIdr || 0);
  const unrealFxIdr = unrealCashIdr + (feat.portfolio ? unrealPfIdr : 0);

  const mIncome = S.incomes.reduce((a, i) => a + dc(i.amount, i.currency, i.date), 0);
  const mExpense = S.expenses.reduce((a, e) => a + dc(e.amount, e.currency, e.date), 0);
  const netFlow = mIncome - mExpense;
  const netFlowPct = mIncome ? (netFlow / mIncome) * 100 : 0;

  // ---- 30-day net-worth change, reconstructed from the ledger --------------
  // Nothing snapshots past net worth, so rebuild the opening balance instead:
  // undo the flows dated inside the window (natively, per currency) and value
  // what was left at the rate in effect then. The move then decomposes exactly
  // into the two things the ledger can prove — flows at their own date's rate,
  // and FX revaluation as the residual. Positions carry today's price on both
  // ends (no price history is stored), so market P&L is left out, not invented.
  const today = parseDate(TODAY);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const win = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  const winStart = win.getFullYear() + "-" + pad2(win.getMonth() + 1) + "-" + pad2(win.getDate());
  const inWin = (d: string) => d > winStart && d <= TODAY;
  const winNat: Record<Cur, number> = { USD: 0, IDR: 0 };
  let flow30 = 0;
  S.incomes.forEach((i) => {
    if (!inWin(i.date)) return;
    winNat[(i.currency || "USD") as Cur] += i.amount;
    flow30 += dc(i.amount, i.currency, i.date);
  });
  S.expenses.forEach((e) => {
    if (!inWin(e.date)) return;
    winNat[(e.currency || "USD") as Cur] -= e.amount;
    flow30 -= dc(e.amount, e.currency, e.date);
  });
  /**
   * Net flow per day across that same 30-day window: income lifts the line,
   * spending pushes it under the zero baseline, and a day nothing moved is a
   * real zero. Every point is a dated transaction valued at its own date's
   * rate — the series used to be deltas of the illustrative equity anchors
   * below, which drew a borrowed rally and then fell off a cliff onto the one
   * genuine number at the end.
   */
  const netSeries = (() => {
    const perDay = new Map<string, number>();
    for (let k = 29; k >= 0; k--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
      perDay.set(d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()), 0);
    }
    const add = (date: string, v: number) => {
      const cur = perDay.get(date);
      if (cur !== undefined) perDay.set(date, cur + v);
    };
    S.incomes.forEach((i) => add(i.date, dc(i.amount, i.currency, i.date)));
    S.expenses.forEach((e) => add(e.date, -dc(e.amount, e.currency, e.date)));
    return [...perDay.values()].map((v) => +v.toFixed(2));
  })();

  // Net worth split by native currency (positions are USD-priced).
  const nwNat: Record<Cur, number> = { USD: feat.portfolio ? pfValue : 0, IDR: 0 };
  [...S.accounts, ...S.wallets, ...(S.capital || [])].forEach((h) => {
    nwNat[(h.currency || "USD") as Cur] += h.bal;
  });
  /** Value a native (USD, IDR) pair in the display currency at a given rate. */
  const valueAt = (usd: number, idr: number, r: number) => (dispCur === "USD" ? usd + idr / r : usd * r + idr);
  const nw30Open = valueAt(nwNat.USD - winNat.USD, nwNat.IDR - winNat.IDR, rateAsOf(winStart));
  const nw30Chg = valueAt(nwNat.USD, nwNat.IDR, rate) - nw30Open;
  const nw30Pct = nw30Open ? (nw30Chg / nw30Open) * 100 : 0;
  const fx30 = nw30Chg - flow30; // residual = revaluation of what was already held

  // The monthly anchors ahead of `netWorth` are illustrative — the ledger doesn't
  // store dated net-worth snapshots yet. A ledger with nothing in it has no
  // history to illustrate, so it draws flat at today's value rather than invent a
  // rally that then falls off a cliff down to zero.
  const hasHistory = S.incomes.length > 0 || S.expenses.length > 0 || S.positions.length > 0;
  const eq = hasHistory
    ? [42, 43.5, 41.8, 45, 47, 46.2, 49, 52, 51, 55, 58, netWorth / 1000]
    : new Array(12).fill(netWorth / 1000);
  const eqL = spark(eq, 620, 175);
  const eqA = eqL + " L620 180 L0 180 Z";

  // Dense, deterministic equity series for the interactive (zoomable) chart:
  // interpolate between the monthly anchors and add seeded noise so the line
  // has real "series" texture without changing on every render.
  const eqSeries: number[] = [];
  let _seed = 0x9e3779b9;
  const _rnd = () => ((_seed = (_seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff);
  for (let s = 0; s < eq.length - 1; s++) {
    for (let k = 0; k < 15; k++) {
      const t = k / 15;
      const base = eq[s] + (eq[s + 1] - eq[s]) * t;
      // No texture on a flat line either — noise around zero reads as movement
      // that never happened.
      eqSeries.push(+(hasHistory ? base + (_rnd() - 0.5) * 1.6 : base).toFixed(2));
    }
  }
  eqSeries.push(+eq[eq.length - 1].toFixed(2));

  // All accent-based shades so the donut follows the active accent, yet each
  // slice stays distinguishable by intensity.
  const allocRaw: [string, number, string][] = [
    ["Free Cash", totalCash, "var(--acc)"],
    ["Vaults", totalBank, "color-mix(in srgb, var(--acc) 76%, var(--surf2))"],
    ["Capital", totalCapital, "color-mix(in srgb, var(--acc) 54%, var(--surf2))"],
    // Dropped entirely when investments are off, so the slices still sum to 100%.
    ...(feat.portfolio
      ? ([["Portfolio", pfValue, "color-mix(in srgb, var(--acc) 36%, var(--surf2))"]] as [string, number, string][])
      : []),
  ];
  const alloc = allocRaw.map(([n, v, c]) => ({
    name: n,
    pct: ((v / netWorth) * 100).toFixed(0) + "%",
    w: ((v / netWorth) * 100).toFixed(0) + "%",
    color: c,
  }));
  const _R = 70;
  const _C = 2 * Math.PI * _R;
  const _Rp = 25;
  const _Cp = 2 * Math.PI * _Rp;
  let _cum = 0;
  const donut = allocRaw.map(([n, v, c]) => {
    const fr = netWorth ? v / netWorth : 0;
    const seg = {
      name: n,
      val: F(v),
      pct: (fr * 100).toFixed(0) + "%",
      color: c,
      dash: (fr * _C).toFixed(2) + " " + (_C - fr * _C).toFixed(2),
      offset: (-_cum * _C).toFixed(2),
      pdash: (fr * _Cp).toFixed(2) + " " + (_Cp - fr * _Cp).toFixed(2),
      poff: (-_cum * _Cp).toFixed(2),
    };
    _cum += fr;
    return seg;
  });

  const rec = [
    ...S.incomes.map((i) => ({ t: "in", name: i.name, meta: i.account, amt: dc(i.amount, i.currency, i.date), date: i.date })),
    ...S.expenses.map((e) => ({ t: "out", name: e.name, meta: e.wallet, amt: dc(e.amount, e.currency, e.date), date: e.date })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((r) => ({
      name: r.name,
      meta: fdate(r.date) + " · " + r.meta,
      amt: (r.t === "in" ? "+" : "-") + FC(r.amt),
      cls: r.t === "in" ? "up" : "dn",
      icon: r.t === "in" ? "↓" : "↑",
      color: r.t === "in" ? "#37e0a0" : "#ff5c7c",
    }));

  // Categories are user-managed. Everything category-driven below iterates this
  // list; "Targeted" (savings goals) is appended later as a system pseudo-category.
  const cats = S.categories || [];
  const catName: Record<string, string> = {};
  cats.forEach((c) => { catName[c.id] = c.name; });
  const letterOf = (nm: string) => ((nm || "").trim()[0] || "?").toUpperCase();

  const cd: Record<string, number> = {};
  cats.forEach((c) => { cd[c.id] = 0; });
  S.expenses.forEach((e) => {
    if (cd[e.cat] != null) cd[e.cat] += dc(e.amount, e.currency, e.date);
  });
  const tgtSaved = S.goals.reduce((a, g) => a + uc(g.saved, g.currency), 0);
  // Goal savings sit beside spend categories in the stats/chart, so they need to
  // be in the same (display) currency as those flow figures.
  const tgtSavedD = toDisp(tgtSaved);
  const prev = S.prevMonth || ({} as any);
  /** Last month's legacy USD-base aggregate, in the display currency. */
  const prevD = (id: string) => toDisp((prev as any)[id] || 0);
  const noteFor = (pct: number) => {
    if (pct > 108) return { t: "Over +" + (pct - 100).toFixed(0) + "%", c: "var(--pnl-dn)" };
    if (pct >= 95) return { t: "Max reached", c: "#e8973b" };
    if (pct >= 60) return { t: "On pace", c: "var(--mut)" };
    return { t: "Well under", c: "var(--pnl-up)" };
  };
  const catBreak = cats.map((c) => {
    const v = cd[c.id] || 0;
    const pv = prevD(c.id) || v || 1;
    const pct = (v / pv) * 100;
    const nt = noteFor(pct);
    return {
      name: c.name,
      chip: "catchip",
      amt: FC(v),
      pct: pct.toFixed(0) + "%",
      w: Math.min(100, pct).toFixed(0) + "%",
      color: "var(--acc)",
      note: nt.t,
      noteCls: nt.c,
      prevAmt: FC(prevD(c.id)),
    };
  });

  const tgtTotal = S.goals.reduce((a, g) => a + uc(g.target, g.currency), 0);
  const tgtGoals = S.goals.map((g) => {
    const p = g.target ? (g.saved / g.target) * 100 : 0;
    return {
      name: g.name,
      saved: F(uc(g.saved, g.currency)),
      target: F(uc(g.target, g.currency)),
      savedRaw: g.saved,
      targetRaw: g.target,
      left: F(uc(Math.max(0, g.target - g.saved), g.currency)),
      pct: p.toFixed(0) + "%",
      pctNum: Math.round(p),
      w: Math.min(100, p).toFixed(0) + "%",
      chip: p >= 100 ? "c-up" : p >= 60 ? "c-tgt" : "c-mut",
      note: p >= 100 ? "Funded" : p >= 60 ? "On track" : "Building",
    };
  });

  const wallets = S.wallets.map((w, i) => {
    const wUsd = uc(w.bal, w.currency);
    return {
      name: w.name,
      tag: w.tag,
      badge: w.badge,
      bal: F(wUsd),
      idx: i,
      w: ((wUsd / (totalCash || 1)) * 100).toFixed(0) + "%",
      pct: ((wUsd / (totalCash || 1)) * 100).toFixed(0) + "%",
    };
  });
  const capitalList = S.capital.map((c, i) => ({ name: c.name, bal: F(uc(c.bal, c.currency)), idx: i }));
  // Forecast for the still-open current month. Fixed/recurring costs tend to
  // repeat last month's amount, and even variable spend usually lands near it —
  // so the full-month estimate = the larger of what's already been spent and
  // last month's total. This never inflates one-off fixed costs (rent won't
  // 2.5×), yet still projects upward while you're tracking below last month.

  // Stat cards + chart legend: one entry per category, then the Targeted system
  // entry. All one accent color — categories are told apart by order + letter.
  const expStats = [
    ...cats.map((c) => ({
      name: c.name,
      letter: letterOf(c.name),
      chip: "catchip",
      amt: FC(cd[c.id] || 0),
      raw: cd[c.id] || 0,
      prevRaw: prevD(c.id),
      meta: S.expenses.filter((e) => e.cat === c.id).length + " items",
    })),
    { name: "Targeted", letter: "T", chip: "catchip", amt: FC(tgtSavedD), raw: tgtSavedD, prevRaw: 0, meta: S.goals.length + " goals" },
  ];

  // Category Spend chart: bucket real expenses by calendar month (real data only).
  const ymKey = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const curKey = ymKey(today);
  const buckets: Record<string, Record<string, number>> = {};
  const bucket = (k: string) => (buckets[k] = buckets[k] || {});
  // Real transaction data only — a month with no expenses gets no bars.
  S.expenses.forEach((e) => {
    const b = bucket(ymKey(parseDate(e.date)));
    b[e.cat] = (b[e.cat] || 0) + dc(e.amount, e.currency, e.date);
  });
  bucket(curKey); // always show the current month, even with no expenses yet
  const monthLabelOf = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
  };
  const byYear: Record<number, any[]> = {};
  Object.keys(buckets).sort().forEach((k) => {
    const y = Number(k.split("-")[0]);
    const b = buckets[k];
    const isCurrent = k === curKey;
    const col = {
      key: k,
      label: monthLabelOf(k),
      year: y,
      isCurrent,
      cats: expStats.map((s, i) => {
        const cat = cats[i]; // undefined for the appended Targeted entry
        const value = cat ? (b[cat.id] || 0) : (isCurrent ? tgtSavedD : 0);
        return { name: s.name, letter: s.letter, value, system: !cat };
      }),
    };
    (byYear[y] = byYear[y] || []).push(col);
  });
  const catChart = {
    legend: expStats.map((s) => ({ name: s.name, letter: s.letter })),
    years: Object.keys(byYear).map(Number).sort((a, b) => a - b),
    byYear,
    curYear: today.getFullYear(),
  };

  const filters = [
    { id: "all", label: "All" },
    ...cats.map((c) => ({ id: c.id, label: c.name })),
    { id: "targeted", label: "Targeted" },
  ].map((f) => ({ id: f.id, label: f.label, cls: "fbtn " + (S.filter === f.id ? "on" : "") }));
  const q = S.q.toLowerCase();
  const expList = S.expenses
    .filter((e) => (S.filter === "all" || e.cat === S.filter) && (!q || e.name.toLowerCase().includes(q)))
    .map((e) => {
      const nm = catName[e.cat] || e.cat;
      return {
        name: e.name,
        cat: nm,
        letter: letterOf(nm),
        chip: "catchip",
        wallet: e.wallet,
        date: fdate(e.date),
        amt: FC(dc(e.amount, e.currency, e.date)),
      };
    });
  const showGoals = S.filter === "targeted";
  const goals = S.goals
    .filter((g) => !q || g.name.toLowerCase().includes(q))
    .map((g) => ({
      name: g.name,
      meta: "Started " + fdate(g.date),
      saved: F(uc(g.saved, g.currency)),
      target: F(uc(g.target, g.currency)),
      w: Math.min(100, g.target ? (g.saved / g.target) * 100 : 0).toFixed(0) + "%",
      pct: (g.target ? (g.saved / g.target) * 100 : 0).toFixed(0) + "%",
    }));

  const bySrcMap: Record<string, number> = {};
  S.incomes.forEach((i) => {
    bySrcMap[i.account] = (bySrcMap[i.account] || 0) + dc(i.amount, i.currency, i.date);
  });
  const maxSrc = Math.max(...Object.values(bySrcMap), 1);
  const bySource = Object.entries(bySrcMap)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => ({ name: n, amt: FC(v), w: (v / maxSrc) * 100 + "%" }));
  const top = Object.entries(bySrcMap).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  const incList = S.incomes.map((i) => ({ name: i.name, account: i.account, date: fdate(i.date), amt: FC(dc(i.amount, i.currency, i.date)) }));
  // The single largest deposit this month — compared in one currency so they mix fairly.
  const biggest = S.incomes.reduce((a: any, i) => (dc(i.amount, i.currency, i.date) > (a ? dc(a.amount, a.currency, a.date) : 0) ? i : a), null as any);
  const bigVal = biggest ? dc(biggest.amount, biggest.currency, biggest.date) : 0;
  const topIncome = biggest
    ? {
        name: biggest.name,
        account: biggest.account,
        amt: FC(bigVal),
        date: fdate(biggest.date),
        sharePct: mIncome ? Math.round((bigVal / mIncome) * 100) + "%" : "0%",
      }
    : null;

  const positions = S.positions.map((p) => {
    const val = p.cur * p.qty;
    const cost = p.avg * p.qty;
    const pnl = val - cost;
    const pct = cost ? (pnl / cost) * 100 : 0;
    const tg = { crypto: "t-cr", stock: "t-st", etf: "t-et", hedge: "t-hg" }[p.type];
    const bg = { crypto: "₿", stock: "≡", etf: "▦", hedge: "T" }[p.type];
    const w = pfValue ? (val / pfValue) * 100 : 0;
    // IDX names quote in rupiah on their own exchange — show them that way even
    // when the app is displaying dollars, so the number matches the broker.
    const px = p.market === "IDX" ? (u: number) => fmtIn(Math.round(u * rate), "IDR") : fmt2;
    return {
      sym: p.sym,
      tag: tg,
      badge: bg,
      venue: p.type === "crypto" ? "" : p.market === "IDX" ? "IDX" : "US",
      qty: +p.qty.toFixed(6),
      avg: px(p.avg),
      cur: px(p.cur),
      value: F(val),
      invested: F(cost),
      weight: w.toFixed(1) + "%",
      weightW: Math.min(100, w) + "%",
      pnl: sfmt(pnl),
      pct: (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%",
      cls: pnl >= 0 ? "up" : "dn",
      // Held but never quoted — almost always the wrong exchange on the row.
      noQuote: S.priceStatus === "live" && !S.livePrices[p.sym],
      _pct: pct,
    };
  });
  const hasPositions = S.positions.length > 0;
  const fundOpts = S.capital.map((c) => ({ val: c.name, label: "Capital · " + c.name + " (" + F(uc(c.bal, c.currency)) + ")" }));
  const posOpts = S.positions.map((p) => ({ val: p.sym, label: p.sym + " · " + +p.qty.toFixed(6) + " @ " + fmt2(p.avg) }));
  const invTypeCls = {
    crypto: "segb " + (S.form.type === "crypto" ? "on" : ""),
    stock: "segb " + (S.form.type === "stock" ? "on" : ""),
    etf: "segb " + (S.form.type === "etf" ? "on" : ""),
    hedge: "segb " + (S.form.type === "hedge" ? "on" : ""),
  };
  const sellSeg = { all: "segb " + (S.form.sellAll ? "on" : ""), partial: "segb " + (!S.form.sellAll ? "on" : "") };
  /**
   * Which exchange the price fields of the open modal belong to. Buying picks it
   * on the form; every later screen inherits it from the position/order it's
   * about, so a share price is never re-read in the wrong currency.
   */
  const formMarket: string =
    S.modal === "sell" || S.modal === "posprice"
      ? // On `posprice` the segment is editable: it's how a position saved under
        // the wrong venue gets corrected, so a deliberate pick has to show.
        (S.modal === "posprice" && S.form.mktPinned ? S.form.market : null) ||
        S.positions.find((p) => p.sym === S.form.posSym)?.market ||
        "US"
      : S.modal === "planeval"
      ? S.plans.find((p) => p.id === S.form.planId)?.market || "US"
      : (S.form.type === "crypto" ? "US" : S.form.market) || "US";
  const mktSeg = { us: "segb " + (formMarket === "US" ? "on" : ""), idx: "segb " + (formMarket === "IDX" ? "on" : "") };
  // Crypto has no listing venue to choose.
  const showMarket = S.form.type !== "crypto";
  /** Currency a share price is typed in — IDX always rupiah, else the display currency. */
  const pxCur: Cur = formMarket === "IDX" ? "IDR" : dispCur;
  const pxNote =
    formMarket === "IDX"
      ? "Harga saham IDX dibaca dalam rupiah, dan dikutip live dari " + (S.form.asset || "TICKER").toUpperCase() + ".JK"
      : "";
  /** The ticker the venue probe should look up — only the free-text forms have one. */
  const probeSym = S.modal === "order" || S.modal === "invest" ? String(S.form.asset || "") : "";
  const probeTicker = probeSym.trim().toUpperCase();
  // What the probe came back with. "both" is the honest answer for a name like
  // BBCA that really is listed twice — say so instead of picking one.
  const mktNote =
    !probeTicker || S.form.type === "crypto"
      ? ""
      : S.form.mktProbe === "both"
      ? probeTicker + " ada di dua bursa — pilih sendiri"
      : S.form.mktProbe === "none"
      ? probeTicker + " tidak ketemu di bursa mana pun"
      : S.form.mktProbe === "idx"
      ? "Ketemu di IDX sebagai " + probeTicker + ".JK"
      : S.form.mktProbe === "us"
      ? "Ketemu di bursa US"
      : "";
  const mktNoteCls = S.form.mktProbe === "none" || S.form.mktProbe === "both" ? "warn" : "";
  /** Read a share price typed into the open modal back into the USD base. */
  const pxUsd = (v: unknown) => (formMarket === "IDX" ? parseAmount(v as string) / rate : toUsd(v as string));
  /** …and back out again, in the currency that modal quotes prices in. */
  const pxFmt = (u: number) => (formMarket === "IDX" ? fmtIn(Math.round(u * rate), "IDR") : fmt2(u));
  const srcBalNum = (() => {
    const a = S.accounts.find((x) => x.name === S.form.src);
    if (a) return uc(a.bal, a.currency);
    const w = S.wallets.find((x) => x.name === S.form.src);
    if (w) return uc(w.bal, w.currency);
    const c = S.capital.find((x) => x.name === S.form.src);
    return c ? uc(c.bal, c.currency) : 0;
  })();
  const investQtyPrev =
    pxUsd(S.form.price) > 0 && toUsd(S.form.amount) > 0
      ? "≈ " + +(toUsd(S.form.amount) / pxUsd(S.form.price)).toFixed(6) + " " + (S.form.asset || "units").toUpperCase()
      : "";
  /**
   * The commission the open form will book, and where the number came from.
   * Mirrors the store's rule exactly: capital that knows its venue prices its
   * own fee, and a typed value overrides — which is also the only path left
   * for capital with no venue set.
   */
  const feeInfo = (() => {
    const m = S.modal;
    let side: "buy" | "sell" = "buy";
    let notional = 0;
    let src: string | undefined;
    if (m === "order" || m === "invest") {
      notional = toUsd(S.form.amount);
      src = S.form.src;
    } else if (m === "sell") {
      const pos = S.positions.find((p) => p.sym === S.form.posSym);
      const qty = S.form.sellAll ? (pos ? pos.qty : 0) : parseFloat(S.form.qty as string) || 0;
      side = "sell";
      notional = qty * pxUsd(S.form.price);
      src = pos && pos.src;
    } else if (m === "closeorder") {
      const o = S.plans.find((p) => p.id === S.form.planId);
      const pos = S.positions.find((p) => p.sym === (o && o.asset));
      const qty = Math.min((o && o.qty) || 0, pos ? pos.qty : 0);
      side = "sell";
      notional = qty * ((o && (o.price || o.entry)) || 0);
      src = (pos && pos.src) || (o && o.src);
    } else {
      return null;
    }
    const b = brokerById((S.capital.find((c) => c.name === src) || ({} as any)).broker);
    const manual = (S.form.fee ?? "").toString().trim() !== "" || !b;
    const amount = manual ? Math.max(0, toUsd(S.form.fee)) : feeFor(b, side, notional, rate);
    // Overriding starts from the derived number, so it has to survive a round
    // trip through the input — plain digits in the display currency, no symbol.
    const disp = convert(amount, "USD", dispCur, rate);
    return {
      manual,
      /** Manual because the capital has no venue — not because a fee was typed. */
      noBroker: !b,
      amount,
      edit: dispCur === "IDR" ? String(Math.round(disp)) : disp.toFixed(2),
      text: F(amount),
      /** e.g. "Stockbit 0.25%" — empty when there's nothing to attribute it to. */
      label: b ? b.name + " " + feeRate(b, side) : "",
      note: feeNote(b, side, notional, rate),
    };
  })();
  const formFee = feeInfo ? feeInfo.amount : 0;
  /**
   * A buy fee rides on top of the amount and joins the cost basis, so the two
   * numbers it changes — cash out and the average you really paid — are the
   * ones worth showing back.
   */
  const buyOut = (() => {
    if (S.modal !== "invest" && S.modal !== "order") return "";
    const fee = formFee;
    const amount = toUsd(S.form.amount);
    const price = pxUsd(S.modal === "order" ? S.form.entry : S.form.price);
    if (fee <= 0 || amount <= 0 || price <= 0) return "";
    return "Total out " + F(amount + fee) + " · avg " + pxFmt((amount + fee) / (amount / price));
  })();
  /** What the open sell form would actually book — both numbers already net of fee. */
  const sellPrev = (() => {
    const pos = S.modal === "sell" ? S.positions.find((p) => p.sym === S.form.posSym) : null;
    if (!pos) return "";
    const price = pxUsd(S.form.price);
    const qty = S.form.sellAll ? pos.qty : parseFloat(S.form.qty as string) || 0;
    if (price <= 0 || qty <= 0) return "";
    const fee = formFee;
    return "Proceeds " + F(qty * price - fee) + " · realized " + sfmt(qty * (price - pos.avg) - fee);
  })();
  /** The same two numbers for the close-order modal, which exits at the order's price. */
  const closeOrd = (() => {
    const o = S.modal === "closeorder" ? S.plans.find((p) => p.id === S.form.planId) : null;
    if (!o) return { sum: "", prev: "" };
    const price = o.price || o.entry;
    const opx = o.market === "IDX" ? fmtIn(Math.round(price * rate), "IDR") : fmt2(price);
    const pos = S.positions.find((p) => p.sym === o.asset);
    if (!pos) return { sum: o.asset + " · position already gone", prev: "" };
    const qty = Math.min(o.qty || 0, pos.qty);
    const fee = formFee;
    return {
      sum: o.asset + " · " + +qty.toFixed(6) + " @ " + opx,
      prev: "Proceeds " + F(qty * price - fee) + " · realized " + sfmt(qty * (price - pos.avg) - fee),
    };
  })();

  const sorted = [...positions].sort((a, b) => b._pct - a._pct);
  const best = sorted[0] || ({ sym: "—" } as any);
  const worst = sorted[sorted.length - 1] || ({ sym: "—" } as any);

  const jTrades = S.journal.length;
  const jWins = S.journal.filter((j) => j.result === "WIN").length;
  const jLoss = S.journal.filter((j) => j.result === "LOSS").length;
  const jWinRate = jTrades ? (jWins / jTrades) * 100 : 0;
  const jNet = S.journal.reduce((a, j) => a + j.pnl, 0);
  const gWin = S.journal.filter((j) => j.pnl > 0).reduce((a, j) => a + j.pnl, 0);
  const gLoss = Math.abs(S.journal.filter((j) => j.pnl < 0).reduce((a, j) => a + j.pnl, 0));
  const jPF = gLoss ? gWin / gLoss : gWin > 0 ? Infinity : 0;
  const jAvgWin = jWins ? gWin / jWins : 0;
  const jAvgLoss = jLoss ? gLoss / jLoss : 0;
  const jPnls = S.journal.map((j) => j.pnl);
  const jBest = jPnls.length ? Math.max(...jPnls) : 0;
  const jWorst = jPnls.length ? Math.min(...jPnls) : 0;
  const journalStats = [
    { k: "Win rate", v: jWinRate.toFixed(0) + "%", cls: "", meta: jWins + "W · " + jLoss + "L" },
    { k: "Net realized", v: sfmt(jNet), cls: jNet >= 0 ? "up" : "dn", meta: "best " + sfmt(jBest) },
    { k: "Profit factor", v: jPF === Infinity ? "∞" : jPF.toFixed(2), cls: jPF >= 1 ? "up" : "dn", meta: "avg " + F(jAvgWin) + " / " + F(jAvgLoss) },
    { k: "Trades", v: String(jTrades), cls: "", meta: "worst " + sfmt(jWorst) },
  ];
  const journal = S.journal.map((j) => {
    // Entry/exit are stored in the USD base; an IDX name is read back in rupiah
    // so the row matches the broker screen, same rule the positions table uses.
    const jpx = j.market === "IDX" ? (u: number) => fmtIn(Math.round(u * rate), "IDR") : fmt2;
    return {
      date: fdate(j.date),
      sym: j.sym,
      note: j.note,
      side: j.side,
      qty: j.qty != null ? String(+j.qty.toFixed(6)) : "—",
      entry: j.entry ? jpx(j.entry) : "—",
      exit: j.exit ? jpx(j.exit) : "—",
      pnl: sfmt(j.pnl),
      // The move that produced it, which is the whole story entry → exit tells.
      move: j.entry ? ((j.exit - j.entry) / j.entry >= 0 ? "+" : "") + (((j.exit - j.entry) / j.entry) * 100).toFixed(1) + "%" : "—",
      // Same move over two days and over two years are not the same trade, so
      // the row carries how long it was held. Same-day closes read "0d".
      held: j.opened ? Math.max(0, Math.round((parseDate(j.date).getTime() - parseDate(j.opened).getTime()) / 864e5)) + "d" : "—",
      fee: j.fee ? "fee " + F(j.fee) : "—",
      cls: j.pnl >= 0 ? "up" : "dn",
      result: j.result,
      resCls: j.result === "WIN" ? "c-up" : "c-dn",
    };
  });

  /**
   * A GitHub-style contribution calendar of realized PnL — 26 weeks back through
   * today, laid out as week columns × weekday rows. Intensity is scaled against
   * the biggest single day so a quiet ledger still shows contrast; the sign
   * picks the colour, so a glance reads green/red streaks rather than numbers.
   */
  const journalHeat = (() => {
    const byDay: Record<string, { pnl: number; n: number }> = {};
    for (const j of S.journal) {
      const d = (byDay[j.date] ||= { pnl: 0, n: 0 });
      d.pnl += j.pnl;
      d.n += 1;
    }
    const end = parseDate(TODAY);
    end.setDate(end.getDate() + (6 - end.getDay())); // pad out to Saturday
    const start = new Date(end);
    start.setDate(start.getDate() - (26 * 7 - 1));
    const peak = Math.max(...Object.values(byDay).map((d) => Math.abs(d.pnl)), 0);

    const weeks: { key: string; days: { key: string; lvl: number; sign: string; title: string; future: boolean }[] }[] = [];
    const months: { label: string; col: number }[] = [];
    const cur = new Date(start);
    for (let w = 0; w < 26; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const iso = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0") + "-" + String(cur.getDate()).padStart(2, "0");
        const hit = byDay[iso];
        const mag = peak > 0 && hit ? Math.abs(hit.pnl) / peak : 0;
        if (d === 0 && cur.getDate() <= 7) months.push({ label: cur.toLocaleDateString("en-US", { month: "short" }), col: w });
        days.push({
          key: iso,
          // 0 = no trades, 1–4 = quartiles of the busiest day.
          lvl: hit ? Math.max(1, Math.ceil(mag * 4)) : 0,
          sign: hit ? (hit.pnl >= 0 ? "pos" : "neg") : "",
          title: hit ? fdate(iso) + " · " + sfmt(hit.pnl) + " · " + hit.n + (hit.n > 1 ? " trades" : " trade") : fdate(iso) + " · no trades",
          future: iso > TODAY,
        });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push({ key: days[0].key, days });
    }
    return { weeks, months, days: ["Mon", "Wed", "Fri"] };
  })();

  /**
   * Realized P&L accumulated day by day over the same 26 weeks the heatmap
   * covers — the portfolio's proven track record, one point per day.
   *
   * Deliberately NOT a market-value curve: positions store no purchase date and
   * the ledger keeps no price history (same reason market P&L is left out of the
   * 30-day net-worth move above), so drawing what the portfolio was worth last
   * month would be invention. Closed trades are dated, so this is the one
   * portfolio series the ledger can actually prove.
   */
  const pfEq = (() => {
    const byDay: Record<string, number> = {};
    for (const j of S.journal) byDay[j.date] = (byDay[j.date] || 0) + j.pnl;

    const end = parseDate(TODAY);
    const start = new Date(end);
    start.setDate(start.getDate() - (26 * 7 - 1));
    const iso = (d: Date) =>
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    const from = iso(start);

    // Trades closed before the window still count — carry them in, or the line
    // would open at zero and read as a drawdown that never happened.
    const series: number[] = [];
    const axis: string[] = [];
    let run = S.journal.reduce((a, j) => (j.date < from ? a + j.pnl : a), 0);
    const cur = new Date(start);
    while (cur <= end) {
      run += byDay[iso(cur)] || 0;
      series.push(+run.toFixed(2));
      // A label on the 1st of each month, thinned to every other one so six
      // months of ticks still fit the hero's width.
      if (cur.getDate() === 1) axis.push(cur.toLocaleDateString("en-US", { month: "short" }).toUpperCase());
      cur.setDate(cur.getDate() + 1);
    }
    return { series, axis: [...axis.filter((_, i) => i % 2 === 0), "NOW"] };
  })();

  const stLabel: Record<string, string> = { waiting: "WAITING", active: "ACTIVE · OPEN", hit: "HIT · TP", stopped: "STOPPED · SL", cancelled: "CANCELLED", closed: "CLOSED" };
  const stCls: Record<string, string> = { waiting: "c-mut", active: "c-fix", hit: "c-up", stopped: "c-dn", cancelled: "c-mut", closed: "c-mut" };
  const plansAll = S.plans.map((p) => {
    const risk = Math.abs(p.entry - p.sl) || 1;
    const reward = Math.abs(p.tp - p.entry);
    const distPct = p.entry ? ((p.price - p.entry) / p.entry) * 100 : 0;
    const qy = p.qty || 0;
    const riskAmt = qy * Math.abs(p.entry - p.sl);
    const rewardAmt = qy * Math.abs(p.tp - p.entry);
    return {
      id: p.id,
      asset: p.asset,
      side: p.side,
      sideCls: p.side === "Long" ? "c-up" : "c-dn",
      status: p.status,
      statusLabel: stLabel[p.status] || p.status,
      statusCls: stCls[p.status] || "c-mut",
      thesis: p.thesis || "—",
      entry: fmt2(p.entry),
      tp: fmt2(p.tp),
      sl: fmt2(p.sl),
      price: fmt2(p.price),
      rr: (reward / risk).toFixed(2) + "R",
      dist: (distPct >= 0 ? "+" : "") + distPct.toFixed(1) + "%",
      capital: p.amount ? F(p.amount) : "—",
      qty: qy ? "" + +qy.toFixed(6) : "—",
      src: p.src || "—",
      riskAmt: qy ? "−" + F(riskAmt) : "—",
      rewardAmt: qy ? "+" + F(rewardAmt) : "—",
      canClose: p.status !== "closed" && p.status !== "cancelled" && !!p.amount,
    };
  });
  const plans = S.planFilter === "all" ? plansAll : plansAll.filter((p) => p.status === S.planFilter);
  const planCounts: Record<string, number> = {};
  S.plans.forEach((p) => {
    planCounts[p.status] = (planCounts[p.status] || 0) + 1;
  });
  const planFilters = (
    [
      ["all", "All"],
      ["waiting", "Waiting"],
      ["active", "Active"],
      ["hit", "Hit"],
      ["stopped", "Stopped"],
      ["closed", "Closed"],
      ["cancelled", "Cancelled"],
    ] as [string, string][]
  ).map(([id, l]) => ({ id, label: id === "all" ? l : l + " " + (planCounts[id] || 0), cls: "fbtn " + (S.planFilter === id ? "on" : "") }));

  const oEntry = pxUsd(S.form.entry);
  const oAmt = toUsd(S.form.amount);
  const oTp = pxUsd(S.form.tp);
  const oSl = pxUsd(S.form.sl);
  const oQty = oEntry > 0 && oAmt > 0 ? oAmt / oEntry : 0;
  const oRisk = oQty * Math.abs(oEntry - oSl);
  const oRew = oQty * Math.abs(oTp - oEntry);
  const oRR = oRisk > 0 ? (oRew / oRisk).toFixed(2) + "R" : "—";
  const orderPrev = [
    { k: "Quantity", v: oQty ? "" + +oQty.toFixed(6) : "—", cls: "" },
    { k: "Risk", v: oQty && oSl > 0 ? "−" + F(oRisk) : "—", cls: "dn" },
    { k: "Reward", v: oQty && oTp > 0 ? "+" + F(oRew) : "—", cls: "up" },
    { k: "R:R", v: oRR, cls: "" },
  ];

  // ---- REBALANCING ---------------------------------------------------------
  // Every number below comes out of `lib/rebalance.ts`; this block only formats
  // it. The engine owns the ordering (band → cash → sell → lots → price), and
  // keeping it pure is what makes the plan testable without a browser.
  const books = S.books || [];
  const book = books.find((b) => b.id === S.bookId) || books[0] || null;
  const rebalMissing = S.priceMissing || [];
  // A plan drawn on marks the app already knows are dead is worse than no plan.
  // *Delayed* is not *stale*, though: IDX quotes are delayed by design and that
  // is a known offset, so only a hard feed error or a name with no quote at all
  // disables execution.
  const rebalPriced = S.priceStatus !== "error" && rebalMissing.length === 0;
  const livePx: Record<string, number> = {};
  Object.keys(S.livePrices || {}).forEach((k) => {
    livePx[k.toUpperCase()] = (S.livePrices as any)[k].price;
  });

  const rebalPlan = rebalance({
    book,
    positions: S.positions,
    capital: S.capital || [],
    rate,
    cashFirst: S.cashFirst !== false,
    priced: rebalPriced,
    prices: livePx,
    fx: feat.fx,
  });

  const pp = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1);
  const wpct = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "") + "%";

  const rebalRows = rebalPlan.nodes.map((n) => {
    const buy = n.need > 0;
    const move = Math.abs(n.need) > 1e-9;
    return {
      id: n.id,
      kind: n.kind,
      sleeveId: n.sleeveId,
      child: n.kind !== "sleeve",
      name: n.name,
      color: n.color,
      value: F(n.value),
      now: n.now.toFixed(1) + "%",
      // A sleeve's weight is of the portfolio; an asset's is of its own sleeve.
      scope: n.kind === "sleeve" ? "portfolio" : "sleeve",
      target: n.target == null ? "—" : wpct(n.target),
      band: n.band ? "−" + n.band.buy + " / +" + n.band.sell : "—",
      drift: n.drift == null ? "—" : pp(n.drift),
      driftCls: n.drift == null || n.inBand ? "" : n.drift > 0 ? "dn" : "up",
      w: Math.min(100, Math.max(0, n.now)).toFixed(1) + "%",
      mark: Math.min(100, Math.max(0, n.target ?? 0)) + "%",
      // The band drawn as a zone, so "inside" is something you can see rather
      // than something you compute from two numbers.
      bandL: n.band && n.target != null ? Math.max(0, n.target - n.band.buy) + "%" : "0%",
      bandW: n.band && n.target != null ? Math.min(100, n.band.buy + n.band.sell) + "%" : "0%",
      action: n.target == null ? "No target" : !move ? "On target" : buy ? "BUY" : "TRIM",
      actionCls: n.target == null ? "c-mut" : !move ? "c-mut" : buy ? "c-up" : "c-dn",
      actionAmt: move ? (buy ? "+" : "−") + F(Math.abs(n.need)) : "—",
      lock: n.lock || "",
      // Hold a US ETF and an IDX stock, let USD/IDR move, and every weight in
      // the book changes without a single trade. Shown, never acted on.
      fx: n.fxDrift != null && Math.abs(n.fxDrift) >= 0.05 ? pp(n.fxDrift) + " pp kurs" : "",
      holdings: n.holdings,
    };
  });

  const sleeveOpts = book ? book.sleeves.map((s) => ({ val: s.id, label: s.name })) : [];
  const rebalLoose = rebalPlan.unassigned.map((u) => ({
    sym: u.sym,
    value: F(u.value),
    now: u.now.toFixed(1) + "%",
    role: u.role,
    reason: u.reason,
    sleeveId: u.sleeveId,
    canAccept: !!u.sleeveId,
  }));

  const moveRow = (m: (typeof rebalPlan.moves)[number]) => ({
    id: m.id,
    kind: m.kind,
    sym: m.sym,
    color: m.color,
    cls: m.kind === "buy" ? "up" : m.kind === "sell" ? "dn" : "",
    title:
      m.kind === "transfer"
        ? "Transfer " + m.from + " → " + m.account
        : (m.kind === "buy" ? "Beli " : "Trim ") + m.sym,
    sub:
      m.kind === "transfer"
        ? m.note
        : m.sleeveName + (m.cross ? " · didanai dari akun lain" : "") + (m.remainder > 1e-9 && m.tradable ? " · sisa " + F(m.remainder) : ""),
    amt: (m.kind === "buy" ? "+" : m.kind === "sell" ? "−" : "") + F(m.amount),
    qty: m.qty ? "" + +m.qty.toFixed(6) : "",
    fee: m.fee > 0 ? "fee " + F(m.fee) : "",
    feeNote: m.feeNote,
    tradable: m.tradable,
    cross: m.cross,
    // Not expensive — impossible. Listed with its lot price rather than dropped.
    lotNote: m.tradable ? "" : "Di bawah 1 lot · 1 lot = " + F(m.lotValue),
    _m: m,
  });

  const rebalGroups = rebalPlan.groups.map((g) => ({
    account: g.account,
    broker: g.broker ? g.broker.name : "belum diset",
    cost: F(g.cost),
    moves: g.moves.map(moveRow),
  }));
  const rebalMoves = rebalPlan.moves.map(moveRow);
  const rebalGaps = rebalPlan.gaps.map((g) => ({
    name: g.name,
    amount: F(Math.abs(g.amount)),
    account: g.account,
    text: "butuh " + F(Math.abs(g.amount)) + " di " + (g.account || "capital"),
    reason: g.reason,
  }));

  // Nothing is suppressed for being expensive — the band already decided what
  // was worth correcting. What is left is to make the price impossible to miss.
  const rebalCost =
    rebalPlan.moves.length +
    " langkah · " +
    F(rebalPlan.cost) +
    " · " +
    rebalPlan.costPct.toFixed(2) +
    "% dari portfolio";
  const rebalBookOpts = books.map((b) => ({ val: b.id, label: b.name }));
  const rebalWeightSum = rebalPlan.weightSum.toFixed(1).replace(/\.0$/, "") + "%";

  // ---- MACRO ---------------------------------------------------------------
  // Same division of labour as the block above: `lib/macro.ts` and `lib/shock.ts`
  // own every number, this only formats them. Four of the six panels never touch
  // the network — see `docs/macro.md` for why that's the point.
  const mv = macro({
    accounts: S.accounts,
    wallets: S.wallets,
    capital: S.capital || [],
    positions: S.positions,
    incomes: S.incomes,
    expenses: S.expenses,
    rate,
    rates: S.rates || [],
    fxCostIdr: S.fxCostIdr || 0,
    pfCostIdr: S.pfCostIdr || 0,
    realizedFxIdr: S.realizedFxIdr || 0,
    fx: feat.fx,
    portfolio: feat.portfolio,
    quotes: (S.macroQuotes || {}) as any,
    today: TODAY,
  });

  const shock = S.shock || { crypto: 0, equities: 0, rate: 0 };
  const sh = shockTest({
    shock,
    positions: S.positions,
    capital: S.capital || [],
    accounts: S.accounts,
    wallets: S.wallets,
    book,
    rate,
    cashFirst: S.cashFirst !== false,
    priced: rebalPriced,
    prices: livePx,
    fx: feat.fx,
    portfolio: feat.portfolio,
    spendPerMonthIdr: mv.mismatch.spendPerMonthIdr,
    spendUsdPct: mv.mismatch.spendUsdPct,
  });

  /** An IDR figure in the display currency. Everything macro returns is rupiah. */
  const mI = (idr: number) => F(uc(idr, "IDR"));
  const mS = (idr: number) => sfmt(uc(idr, "IDR"));
  const pct1 = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const cls = (n: number) => (n >= 0 ? "up" : "dn");

  // 01 · attribution. The legs used to live inside `title=` attributes, which on
  // a phone cannot be opened at all — this is the same arithmetic at full size.
  const at = mv.attribution;
  const attrLegs = [
    { k: "Kamu nabung", raw: at.flowIdr, note: "Arus kas, tiap transaksi pada kurs tanggalnya" },
    ...(feat.fx ? [{ k: "Kurs", raw: at.fxIdr, note: "Revaluasi yang sudah dipegang" }] : []),
  ];
  const attrSum = attrLegs.reduce((a, l) => a + Math.abs(l.raw), 0) || 1;
  const macroAttr = {
    window: fdate(at.from) + " → " + fdate(at.to),
    open: mI(at.openIdr),
    close: mI(at.closeIdr),
    change: mS(at.changeIdr),
    changeCls: cls(at.changeIdr),
    changePct: pct1(at.changePct),
    empty: Math.abs(at.changeIdr) < 1e-9 && !at.flowIdr,
    legs: attrLegs.map((l) => ({
      k: l.k,
      v: mS(l.raw),
      cls: cls(l.raw),
      w: ((Math.abs(l.raw) / attrSum) * 100).toFixed(1) + "%",
      note: l.note,
    })),
    // Stated on the card's face, not in a tooltip: without stored price history
    // there is no in-window price leg, and one is not invented.
    priceBlind: at.priceBlind,
    life: [
      { k: "Harga posisi", v: mS(at.life.priceIdr), cls: cls(at.life.priceIdr), show: feat.portfolio },
      { k: "Kurs terealisasi", v: mS(at.life.fxRealizedIdr), cls: cls(at.life.fxRealizedIdr), show: feat.fx },
      { k: "Kurs kas", v: mS(at.life.fxUnrealCashIdr), cls: cls(at.life.fxUnrealCashIdr), show: feat.fx },
      { k: "Kurs portofolio", v: mS(at.life.fxUnrealPfIdr), cls: cls(at.life.fxUnrealPfIdr), show: feat.fx && feat.portfolio },
    ].filter((r) => r.show),
  };

  // 02 · the rate curve `rates[]` has held all along and never drawn.
  const macroRate = (() => {
    const W = 620;
    const H = 150;
    const pts = mv.rateCurve.points.slice();
    // The valuation rate in effect today is a fact even when no quote was
    // adopted today, so the line runs to it rather than stopping short.
    if (!pts.length || pts[pts.length - 1].date < TODAY) pts.push({ date: TODAY, idrPerUsd: rate });
    const vals = pts.map((p) => p.idrPerUsd);
    const avg = mv.rateCurve.avgIdr;
    let lo = Math.min(...vals, avg || Infinity);
    let hi = Math.max(...vals, avg || -Infinity);
    const padY = (hi - lo) * 0.12 || hi * 0.01 || 1;
    lo -= padY;
    hi += padY;
    const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
    const x = (i: number) => (i / (pts.length - 1 || 1)) * W;
    const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.idrPerUsd).toFixed(1)).join(" ");
    const gap = mv.rateCurve.gapPct;
    return {
      show: feat.fx,
      w: W,
      h: H,
      line,
      area: line + " L" + W + " " + H + " L0 " + H + " Z",
      avgY: avg == null ? null : y(avg).toFixed(1),
      avgLabel: avg == null ? "" : fmtRate(avg),
      spotLabel: fmtRate(rate),
      hiLabel: fmtRate(hi),
      loLabel: fmtRate(lo),
      axis: [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]].map((p) => fdate(p.date)),
      points: pts.length,
      gap: gap == null ? "" : pct1(gap),
      gapCls: gap == null ? "" : gap >= 0 ? "up" : "dn",
      gapAmt: mv.rateCurve.gapIdr == null ? "" : mS(mv.rateCurve.gapIdr),
      hasAvg: avg != null,
      // The one thing this panel can't draw, said once instead of implied.
      note: avg == null ? "Belum pegang dolar — belum ada kurs perolehan." : "Konversi satuan belum tercatat.",
    };
  })();

  // 03 · a driver earns its row by touching a position.
  const macroDrivers = mv.drivers.map((d) => ({
    id: d.id,
    ticker: d.ticker,
    name: d.name,
    // `^GSPC` → GSPC, `BTC-USD` → BTC, `IDR=X` → IDR. An index's caret is part of
    // Yahoo's syntax, not of the name, so it can't lead the badge.
    tag: d.ticker.replace(/^\^/, "").split(/[-=.]/)[0].slice(0, 4),
    share: d.sharePct.toFixed(1) + "%",
    shareW: Math.min(100, d.sharePct).toFixed(1) + "%",
    price: d.price == null ? "—" : d.kind === "fx" ? fmtRate(d.price) : d.price.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    chg: d.changePct == null ? "—" : pct1(d.changePct),
    chgCls: d.changePct == null ? "" : cls(d.changePct),
    // Only currency converts into money. Everything else stops at the move and
    // the weight — a portfolio delta would need a beta, and beta needs history.
    money: d.moneyIdr == null ? "" : mS(d.moneyIdr),
    moneyCls: d.moneyIdr == null ? "" : cls(d.moneyIdr),
    exact: d.exact,
    touches: d.touches.slice(0, 6).join(" · ") + (d.touches.length > 6 ? " +" + (d.touches.length - 6) : ""),
  }));

  // 04 · you supply the shock, the app supplies the arithmetic.
  const hasCrypto = S.positions.some((p) => p.type === "crypto");
  const hasEquity = S.positions.some((p) => p.type === "stock" || p.type === "etf");
  const macroShock = {
    show: feat.portfolio && S.positions.length > 0,
    idle: sh.idle,
    sliders: [
      { key: "crypto", label: "Crypto", val: shock.crypto, min: -60, max: 40, show: hasCrypto },
      { key: "equities", label: "Saham & ETF", val: shock.equities, min: -60, max: 40, show: hasEquity },
      { key: "rate", label: "USD/IDR", val: shock.rate, min: -20, max: 20, show: feat.fx },
    ].filter((s) => s.show).map((s) => ({ ...s, out: (s.val > 0 ? "+" : "") + s.val + "%" })),
    net: mI(sh.before.netIdr),
    netAfter: mI(sh.after.netIdr),
    delta: mS(sh.deltaIdr),
    deltaCls: cls(sh.deltaIdr),
    deltaPct: pct1(sh.deltaPct),
    legs: [
      { k: "Harga", v: mS(sh.assetIdr), cls: cls(sh.assetIdr) },
      ...(feat.fx ? [{ k: "Kurs", v: mS(sh.fxIdr), cls: cls(sh.fxIdr) }] : []),
    ],
    rateAfter: fmtRate(sh.after.rate),
    runway: sh.before.runwayMonths == null ? "—" : sh.before.runwayMonths.toFixed(1) + " bln",
    runwayAfter: sh.after.runwayMonths == null ? "—" : sh.after.runwayMonths.toFixed(1) + " bln",
    runwayCls: sh.runwayDelta == null ? "" : sh.runwayDelta >= 0 ? "up" : "dn",
    breaches: sh.breaches.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      // Percentage points from target, not a percent change — `pp` carries the unit.
      drift: pp(b.drift) + " pp",
      driftCls: cls(b.drift),
      need: (b.need > 0 ? "Top up " : "Trim ") + mI(Math.abs(b.need) * sh.after.rate),
      fresh: b.fresh,
    })),
    // Q3, and the question a drawdown actually asks: is the buffer big enough to
    // buy the dip you keep saying you'd buy?
    // Valued at the shocked rate — these belong to the hypothetical, not to today.
    buys: mI(sh.buysIdr),
    idleCash: mI(sh.idleCashIdr),
    funded: sh.fundedByCash,
    fundNote: sh.fundedByCash
      ? sh.buysUsd > 1e-9
        ? "Kas menutup pembelian."
        : "Tidak ada pembelian yang dibutuhkan."
      : "Kurang " + mI(sh.gapUsd * sh.after.rate) + " — koreksi harus menjual.",
    needsSell: sh.needsSell,
    cost:
      mI(sh.costIdr) +
      " · " +
      // A real cost that rounds to 0.00% reads as free, which it isn't.
      (sh.costPct > 0 && sh.costPct < 0.01 ? "<0.01" : sh.costPct.toFixed(2)) +
      "%",
    moves: sh.plan.moves.length,
    noBook: sh.plan.state === "nobook",
  };

  // 05 · the household currency book. This is why an Indonesian ledger has a
  // macro tab at all: the portfolio is not the exposure.
  const mm = mv.mismatch;
  const share = (n: number | null) => (n == null ? "—" : n.toFixed(0) + "%");
  const macroMismatch = {
    rows: [
      { k: "Pemasukan rupiah", v: share(mm.incomeIdrPct), w: (mm.incomeIdrPct || 0) + "%" },
      { k: "Pengeluaran rupiah", v: share(mm.spendIdrPct), w: (mm.spendIdrPct || 0) + "%" },
      { k: "Aset dolar", v: share(mm.assetUsdPct), w: (mm.assetUsdPct || 0) + "%" },
    ],
    show: feat.fx,
    months: mm.months,
    liquid: mI(mm.liquidIdr),
    spend: mm.spendPerMonthIdr == null ? "—" : mI(mm.spendPerMonthIdr),
    runway: mm.runwayMonths == null ? "—" : mm.runwayMonths.toFixed(1),
    hasRunway: mm.runwayMonths != null,
    empty: mm.spendPerMonthIdr == null && mm.incomeIdrPct == null,
  };

  // 06 · the log measures, it doesn't score.
  const readMeta: Record<string, [string, string]> = {
    bullish: ["Bullish", "c-up"],
    bearish: ["Bearish", "c-dn"],
    neutral: ["Netral", "c-mut"],
  };
  const macroLog = measureNotes(S.mlog || [], S.positions, S.macroMoves || {}, TODAY).map((n) => {
    const [label, chip] = readMeta[n.note.read] || readMeta.neutral;
    return {
      id: n.note.id,
      title: n.note.title,
      date: fdate(n.note.date),
      days: n.days === 0 ? "hari ini" : n.days + " hari lalu",
      read: label,
      readCls: "chip " + chip,
      source: n.note.source || "",
      body: n.note.body || "",
      syms: n.syms.map((s) => ({
        sym: s.sym,
        pct: s.pct == null ? "—" : pct1(s.pct),
        cls: s.pct == null ? "" : cls(s.pct),
        held: s.held,
      })),
    };
  });
  const macroBadge = (() => {
    switch (S.macroStatus) {
      case "live":
        return { text: S.macroAt ? new Date(S.macroAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "LIVE", dot: "var(--pnl-up)" };
      case "loading":
        return { text: "Syncing…", dot: "var(--acc)" };
      case "error":
        return { text: "Feed offline", dot: "#ff5c7c" };
      default:
        return { text: "—", dot: "var(--mut)" };
    }
  })();

  // live-feed status badge
  const priceUpdatedLabel = S.pricesAt
    ? new Date(S.pricesAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  const missing = S.priceMissing || [];
  const priceBadge = (() => {
    switch (S.priceStatus) {
      case "live": {
        // Partly live is not live. Name the count so a price that stopped moving
        // is read as "we never got a quote", not "the market is quiet".
        const stamp = priceUpdatedLabel ? " · " + priceUpdatedLabel : "";
        return missing.length
          ? { text: missing.length + " NO QUOTE" + stamp, dot: "#ffb020" }
          : { text: "LIVE" + stamp, dot: "var(--pnl-up)" };
      }
      case "loading":
        return { text: "Syncing…", dot: "var(--acc)" };
      case "error":
        return { text: "Feed offline", dot: "#ff5c7c" };
      default:
        return { text: "Connecting…", dot: "var(--mut)" };
    }
  })();
  const priceBadgeTitle = missing.length
    ? "Belum ada kutipan untuk " + missing.join(", ") + " — cek bursanya sudah benar (IDX butuh .JK)"
    : "Live market prices — crypto and IDX via Yahoo Finance, US stocks via Finnhub when a key is set";

  // USD/IDR panel: the valuation rate is frozen (net worth shouldn't twitch on
  // every quote); the live quote sits beside it until you adopt it deliberately.
  const fxDrift = S.fxLive ? ((S.fxLive - rate) / rate) * 100 : 0;
  const fx = {
    rate,
    rateLabel: fmtRate(rate),
    live: S.fxLive,
    liveLabel: S.fxLive ? fmtRate(S.fxLive) : "—",
    status: S.fxStatus,
    updated: S.fxAt ? new Date(S.fxAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    driftPct: (fxDrift >= 0 ? "+" : "") + fxDrift.toFixed(2) + "%",
    driftCls: fxDrift >= 0 ? "up" : "dn",
    // Only worth adopting once the live quote has actually moved off the book rate.
    canAdopt: !!S.fxLive && Math.abs(fxDrift) >= 0.01,
    dot: S.fxStatus === "live" ? "#37e0a0" : S.fxStatus === "error" ? "#ff5c7c" : "var(--mut)",
    points: (S.rates || []).length,
  };

  const titles: Record<string, [string, string]> = {
    dashboard: ["Dashboard", "Your complete money picture, one screen"],
    cash: ["Cash", "Free-to-use money · uang bebas pakai"],
    flow: ["Cash Flow", "Income & expenses in one place"],
    portfolio: ["Portfolio", "PnL · Strategy · Rebalancing · Macro"],
  };
  const [sTitle, sSub] = titles[S.section];
  const primLabel = ({ dashboard: "Quick Add", cash: "Transfer", flow: "Quick Add", portfolio: "+ Invest" } as any)[S.section];
  const pfTabs = (
    [
      ["pnl", "PnL"],
      ["strategy", "Strategy"],
      ["rebalance", "Rebalancing"],
      ["macro", "Macro"],
    ] as [string, string][]
  ).map(([id, l]) => ({ id, label: l, cls: "stbtn " + (S.pfTab === id ? "on" : "") }));
  const mTitles: Record<string, string> = {
    expense: "Add Expense",
    goal: "New Savings Goal",
    income: "Add Income",
    transfer: "Transfer Money",
    plan: "New Trade Plan",
    order: "New Order",
    planeval: "Update Price",
    closeorder: "Close Order",
    invest: "Buy · Invest Funds",
    sell: "Sell Position",
    posprice: "Update Market Price",
    book: "Target book",
    categories: "Manage Categories",
    note: "Catatan makro",
  };
  const transferOpts = [
    ...S.accounts.map((a) => ({ val: a.name, label: "Vault · " + a.name })),
    ...S.wallets.map((w) => ({ val: w.name, label: "Wallet · " + w.name })),
    ...S.capital.map((c) => ({ val: c.name, label: "Capital · " + c.name })),
  ];
  const accountsList = S.accounts.map((a, i) => ({ name: a.name, bal: F(uc(a.bal, a.currency)), idx: i }));
  const placeKind = S.form.placeKind || "account";
  const isEditPlace = S.form.idx != null;
  const placeKindLabel = placeKind === "account" ? "Vault" : placeKind === "capital" ? "Capital account" : "Wallet";
  const placeTitle = (isEditPlace ? "Edit " : "Add ") + placeKindLabel;
  const placePlaceholder = placeKind === "account" ? "e.g. BCA Checking" : placeKind === "capital" ? "e.g. Trading Capital" : "e.g. Main Spending";
  // Only capital trades, so only capital carries a venue — and naming it here is
  // what stops every trade form from asking for a fee.
  const placeIsCapital = placeKind === "capital";
  const brokerOpts = BROKERS.map((b) => ({ val: b.id, label: b.name + " · " + feeRate(b, "buy") + " / " + feeRate(b, "sell") }));
  // Currency is baked into every amount this holder stores, so it can only be
  // chosen while the holder is still empty and unused.
  const placeArr: any[] = (S as any)[placeKind === "account" ? "accounts" : placeKind === "capital" ? "capital" : "wallets"] || [];
  const placeItem = isEditPlace ? placeArr[S.form.idx] : null;
  const placeUsed = !!placeItem && (
    Math.abs(placeItem.bal || 0) > 1e-9 ||
    S.expenses.some((e) => e.wallet === placeItem.name) ||
    S.incomes.some((i) => i.account === placeItem.name) ||
    (S.presets || []).some((p) => p.wallet === placeItem.name || p.account === placeItem.name || p.from === placeItem.name || p.to === placeItem.name) ||
    (S.plans || []).some((p) => p.src === placeItem.name)
  );
  // With FX off `dispCur` is IDR, so new holders are created in rupiah without
  // ever showing a currency picker.
  const placeCur: Cur = (S.form.placeCur as Cur) || (placeItem && placeItem.currency) || dispCur;
  const placeCurSeg = (["IDR", "USD"] as Cur[]).map((c) => ({
    id: c,
    label: c === "IDR" ? "Rupiah (Rp)" : "Dollar ($)",
    cls: "segb " + (placeCur === c ? "on" : "") + (placeUsed ? " off" : ""),
  }));
  const placeCurNote = placeUsed
    ? "Currency terkunci — " + (placeItem?.name || "akun ini") + " sudah punya saldo/transaksi. Semua nilai tersimpan dalam " + placeCur + "."
    : "Semua saldo & transaksi di sini disimpan dalam " + placeCur + ". Kurs hanya dipakai saat menampilkan.";
  const placeHint =
    placeKind === "account"
      ? "A vault receives income and only releases funds via transfer. Its balance changes through income or transfers — never edited by hand."
      : placeKind === "capital"
      ? "Portfolio capital — buying power used only for investing and orders. Fund it by transferring in; balance changes only via transfer, buys and sells."
      : "Spending wallet — funded by transfers, used for every expense. Balance changes only through transfers and expenses.";
  const catSeg = cats.map((c) => ({ id: c.id, label: c.name, cls: "segb " + (S.form.cat === c.id ? "on" : "") }));

  const themeCards = (
    [
      ["dark", "Dark"],
      ["light", "Light"],
      ["midnight", "Midnight"],
    ] as ["dark" | "light" | "midnight", string][]
  ).map(([id, l]) => {
    const t = THEMES[id];
    return { id, label: l, cls: S.theme === id ? "on" : "", bg: t.bg, d1: t.mut, d2: t.acc };
  });
  const colorRows = TOKEN_LABELS.map(([tk, l]) => ({ token: tk, label: l, value: (activeColors as any)[tk], hex: ((activeColors as any)[tk] || "").toUpperCase() }));

  const presetView = (p: any) => {
    const amt = F(uc(p.amount, p.currency));
    if (p.kind === "transfer") {
      return { id: p.id, label: p.label, icon: "⇄", iconBg: "rgba(201,255,61,.14)", iconFg: "var(--acc)", amt, cls: "" };
    }
    const isE = p.kind === "expense";
    return { id: p.id, label: p.label, icon: isE ? "↑" : "↓", iconBg: isE ? "rgba(255,92,124,.14)" : "rgba(55,224,160,.14)", iconFg: isE ? "#ff5c7c" : "#37e0a0", amt: (isE ? "-" : "+") + amt, cls: isE ? "dn" : "up" };
  };
  const tapPresets = S.presets.filter((p) => (p.mode || "tap") !== "recurring").map(presetView);
  const recPresets = S.presets
    .filter((p) => p.mode === "recurring")
    .map((p) => {
      const v = presetView(p);
      const nr = nextRunStr(p);
      return { ...v, schedule: scheduleText(p), next: nr ? fdate(nr) : "—" };
    });
  const freqSeg = (
    [
      ["daily", "Daily"],
      ["weekly", "Weekly"],
      ["monthly", "Monthly"],
    ] as [string, string][]
  ).map(([id, l]) => ({ id, label: l, cls: "segb " + ((S.form.freq || "monthly") === id ? "on" : "") }));
  const weekdayOpts = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((l, i) => ({ val: i, label: l }));
  const fMode = S.form.mode || "tap";
  const fFreq = S.form.freq || "monthly";

  return {
    shellCls: (S.navOpen ? "open " : "") + (S.themeOpen ? "themeopen" : ""),
    navOpen: S.navOpen,
    feat,
    curCls: { usd: "curbtn " + (dispCur === "USD" ? "on" : ""), idr: "curbtn " + (dispCur === "IDR" ? "on" : "") },
    cur: dispCur,
    sectionTitle: sTitle,
    sectionSub: sSub,
    primaryLabel: primLabel,
    showPrimary: S.section !== "dashboard" && S.section !== "portfolio",
    showBack: S.section !== "dashboard",
    priceBadge,
    priceBadgeTitle,
    priceMissing: missing,
    priceStatus: S.priceStatus,
    priceUpdatedLabel,
    q: S.q,
    show: {
      dashboard: S.section === "dashboard",
      cash: S.section === "cash",
      flow: S.section === "flow",
      portfolio: feat.portfolio && S.section === "portfolio",
    },
    f: {
      netWorth: F(netWorth),
      netWorthChg: Math.abs(nw30Pct).toFixed(1) + "%",
      netWorthChgArrow: nw30Pct >= 0 ? "▲" : "▼",
      netWorthChgCls: nw30Pct >= 0 ? "up" : "dn",
      // Inside the hero the global .up/.dn colors would fight the accent, so the
      // pills carry their own tone.
      netWorthChgTone: nw30Pct >= 0 ? "pos" : "neg",
      netWorthChgTitle:
        "Net worth " + fdate(winStart) + " → " + fdate(TODAY) + ": " + FC(nw30Open) + " → " + FC(valueAt(nwNat.USD, nwNat.IDR, rate)) +
        " (" + sfc(nw30Chg) + ")\nArus kas " + sfc(flow30) +
        (feat.fx ? " + efek kurs " + sfc(fx30) : "") +
        (feat.portfolio ? "\nHarga pasar portofolio dianggap tetap — tidak ada riwayat harga tersimpan." : ""),
      freeCash: F(totalCash),
      deployCash: F(totalCapital),
      pfValue: F(pfValue),
      pfPnl: sfmt(pfPnl),
      pfPnlCls: pfPnl >= 0 ? "up" : "dn",
      pfPnlPct: (pfPnl >= 0 ? "+" : "") + (pfCost ? (pfPnl / pfCost) * 100 : 0).toFixed(1) + "%",
      pfCost: F(pfCost),
      netFlow: sfc(netFlow),
      netFlowPct: (netFlow >= 0 ? "+" : "") + netFlowPct.toFixed(0) + "%",
      netFlowCls: netFlow >= 0 ? "up" : "dn",
      realizedFx: sfmt(uc(S.realizedFxIdr || 0, "IDR")),
      realizedFxCls: (S.realizedFxIdr || 0) >= 0 ? "up" : "dn",
      unrealizedFx: sfmt(uc(unrealFxIdr, "IDR")),
      unrealizedFxCls: unrealFxIdr >= 0 ? "up" : "dn",
      unrealizedFxArrow: unrealFxIdr >= 0 ? "▲" : "▼",
      unrealizedFxTone: unrealFxIdr >= 0 ? "pos" : "neg",
      unrealizedFxTitle:
        "Efek kurs belum terealisasi (nilai sekarang vs kurs saat diperoleh)\nKas " + sfmt(uc(unrealCashIdr, "IDR")) +
        " + portofolio " + sfmt(uc(unrealPfIdr, "IDR")) + "\nKontribusi kurs pada 30 hari terakhir: " + sfc(fx30),
      pfFx: sfmt(uc(unrealPfIdr, "IDR")),
      pfFxCls: unrealPfIdr >= 0 ? "up" : "dn",
      netSeries,
      mIncome: FC(mIncome),
      mExpense: FC(mExpense),
      topSource: top[0],
      topSourceAmt: FC(top[1] as number),
      avgIncome: FC(mIncome / (S.incomes.length || 1)),
      bestSym: best.sym,
      bestPct: best.pct,
      worstSym: worst.sym,
      worstPct: worst.pct,
      worstCls: worst.cls,
      tgtSaved: F(tgtSaved),
      tgtTotal: F(tgtTotal),
      tgtPct: ((tgtSaved / (tgtTotal || 1)) * 100).toFixed(0) + "%",
    },
    tgtGoals,
    equityLine: eqL,
    equityArea: eqA,
    equitySeries: eqSeries,
    alloc,
    donut,
    recent: rec,
    catBreak,
    wallets,
    walletCount: S.wallets.length,
    accounts: S.accounts,
    accountsList,
    capitalList,
    capitalCount: S.capital.length,
    transferOpts,
    placeKindLabel,
    placeIsCapital,
    brokerOpts,
    placePlaceholder,
    placeHint,
    placeCurSeg,
    placeCurLocked: placeUsed,
    placeCurNote,
    fx,
    expStats,
    catChart,
    categories: S.categories,
    filters,
    expList,
    expEmpty: expList.length === 0,
    showGoals,
    showExpList: !showGoals,
    goals,
    incList,
    bySource,
    topIncome,
    incCount: S.incomes.length,
    pfTabs,
    pf: { pnl: S.pfTab === "pnl", journal: S.pfTab === ("journal" as any), strategy: S.pfTab === "strategy", planning: S.pfTab === ("planning" as any), rebalance: S.pfTab === "rebalance", macro: S.pfTab === "macro" },
    rebal: rebalRows,
    rebalMoves,
    rebalGroups,
    rebalGaps,
    rebalLoose,
    rebalCost,
    rebalBookOpts,
    rebalBookId: book ? book.id : "",
    rebalBookName: book ? book.name : "",
    rebalWeightSum,
    // The book is only well formed when its sleeves total 100 — say so rather
    // than silently normalising, which would move someone's targets for them.
    rebalWeightOff: !!book && Math.abs(rebalPlan.weightSum - 100) > 0.5,
    rebalCashFirst: S.cashFirst !== false,
    rebalMissing,
    rebalSleeveOpts: sleeveOpts,
    macroAttr,
    macroRate,
    macroDrivers,
    macroShock,
    macroMismatch,
    macroLog,
    macroBadge,
    macroShockRaw: shock,
    /** Only held names can be tagged on a note — the rest measure nothing. */
    noteSymOpts: S.positions.map((p) => p.sym),
    // An empty plan has three meanings and they must not look alike.
    rebalState: rebalPlan.state,
    rebalNoBook: rebalPlan.state === "nobook",
    rebalEmpty: rebalPlan.state === "empty",
    rebalNotPriced: rebalPlan.state === "notpriced",
    rebalOnTarget: rebalPlan.state === "ontarget",
    rebalNotTradable: rebalPlan.state === "nottradable",
    hasMoves: rebalPlan.moves.length > 0,
    canExecute: rebalPlan.state === "moves",
    pfLocked: S.section === "portfolio" && !S.pfUnlocked,
    pfUnlocked: S.pfUnlocked,
    pfBgCss: S.pfBg ? 'url("' + S.pfBg + '")' : "none",
    lockInput: S.lockInput,
    lockErrMsg: S.lockErr ? "Wrong passcode. Try again." : "",
    positions,
    journal,
    journalStats,
    journalHeat,
    journalEmpty: S.journal.length === 0,
    pfEquity: pfEq.series,
    pfEquityAxis: pfEq.axis,
    plans,
    planFilters,
    themeOpen: S.themeOpen,
    themeCards,
    themeName: S.theme.toUpperCase(),
    colorRows,
    quickOpen: S.modal === "quickadd",
    qHub: S.qView === "hub",
    qChoose: S.qView === "choose",
    qNew: S.qView === "new",
    tapPresets,
    recPresets,
    hasTap: tapPresets.length > 0,
    hasRec: recPresets.length > 0,
    noPresets: S.presets.length === 0,
    freqSeg,
    weekdayOpts,
    builderRec: fMode === "recurring",
    freqWeekly: fFreq === "weekly",
    freqMonthly: fFreq === "monthly",
    builderHint:
      fMode === "recurring"
        ? "This runs automatically on the schedule you set and logs itself — no tapping needed."
        : "This becomes a one-tap button in Quick Add. Amount is preset — tap it to log instantly with today's date.",
    quickTitle: S.qView === "choose" ? "New button" : S.qView === "new" ? (fMode === "recurring" ? "New recurring" : "New quick button") : "Quick Add",
    quickSub: S.qView === "choose" ? "What kind of button do you want?" : S.qView === "new" ? (fMode === "recurring" ? "Runs on a schedule automatically" : "Save a preset to log in one tap") : "Tap a button to log instantly",
    kindCls: { expense: "segb " + (S.form.kind === "expense" ? "on" : ""), income: "segb " + (S.form.kind === "income" ? "on" : ""), transfer: "segb " + (S.form.kind === "transfer" ? "on" : "") },
    builderExpense: S.form.kind === "expense",
    builderIncome: S.form.kind === "income",
    builderTransfer: S.form.kind === "transfer",
    modalOpen: !!S.modal && S.modal !== "quickadd",
    modalTitle: S.modal === "place" ? placeTitle : mTitles[S.modal || ""] || "",
    form: S.form,
    m: {
      expense: S.modal === "expense",
      goal: S.modal === "goal",
      income: S.modal === "income",
      transfer: S.modal === "transfer",
      place: S.modal === "place",
      position: S.modal === "position",
      plan: S.modal === "plan",
      order: S.modal === "order",
      planeval: S.modal === "planeval",
      closeorder: S.modal === "closeorder",
      invest: S.modal === "invest",
      sell: S.modal === "sell",
      posprice: S.modal === "posprice",
      book: S.modal === "book",
      categories: S.modal === "categories",
      note: S.modal === "note",
    },
    catSeg,
    hasPositions,
    fundOpts,
    posOpts,
    invTypeCls,
    mktSeg,
    showMarket,
    pxCur,
    pxNote,
    probeSym,
    mktNote,
    mktNoteCls,
    sellSeg,
    sellAll: !!S.form.sellAll,
    sellPartial: !S.form.sellAll,
    srcBal: F(srcBalNum),
    investQtyPrev,
    feeInfo,
    buyOut,
    sellPrev,
    closeOrd,
    orderPrev,
    sideCls: { long: "segb " + (S.form.side === "Long" ? "on" : ""), short: "segb " + (S.form.side === "Short" ? "on" : "") },
    toast: S.toast,
    toastShow: !!S.toast,
    // pass-throughs the wallet grid needs
    walletsRaw: S.wallets,
    accountsRaw: S.accounts,
    capitalRaw: S.capital,
  };
}

export type View = ReturnType<typeof derive>;
