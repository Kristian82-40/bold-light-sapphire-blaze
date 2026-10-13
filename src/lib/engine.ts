import type { RawPool } from "@/lib/pools";

export const CHAIN_OPTIONS = ["Ethereum", "Base", "Arbitrum", "OP Mainnet"] as const;

export type Universe = "estables" | "mayores" | "todos";

export type Settings = {
  capital: number;
  maxPositionPct: number;
  minTvl: number;
  minNetApy: number;
  holdDays: number;
  universe: Universe;
  chains: string[];
  avoidDown: boolean;
};

export type ScoredPool = RawPool & {
  ticket: number;
  entryCostPct: number;
  haircutPct: number;
  netApy: number;
  peerMedian: number | null;
  premium: number | null;
  pass: boolean;
  reason: string | null;
  score: number;
};

export type Allocation = {
  pool: ScoredPool;
  amount: number;
};

export const DEFAULT_SETTINGS: Settings = {
  capital: 10_000,
  maxPositionPct: 25,
  minTvl: 5_000_000,
  minNetApy: 1.5,
  holdDays: 30,
  universe: "estables",
  chains: [...CHAIN_OPTIONS],
  avoidDown: true,
};

const GAS_USD: Record<string, number> = {
  Ethereum: 7,
  Base: 0.08,
  Arbitrum: 0.15,
  "OP Mainnet": 0.1,
};

const MAX_APY = 35;
const MAX_DEPTH_PCT = 1;
const MAJOR =
  /(^|[^A-Z])(ETH|WETH|WSTETH|WEETH|RETH|CBETH|RSETH|BTC|WBTC|CBBTC|TBTC|SOL|WSOL)([^A-Z]|$)/;

export function inUniverse(pool: RawPool, universe: Universe) {
  if (universe === "todos") return true;
  if (universe === "estables") return pool.stablecoin;
  return pool.stablecoin || MAJOR.test(pool.symbol.toUpperCase());
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function costOf(pool: RawPool, ticket: number, holdDays: number) {
  const gasPct = ((GAS_USD[pool.chain] ?? 0.2) / Math.max(ticket, 1)) * 100;
  const depth = ticket / Math.max(pool.tvlUsd, 1);
  const lp = pool.ilRisk === "yes";
  const slipPct = (lp ? 0.06 : 0.008) + depth * (lp ? 25 : 6);
  const entryCostPct = gasPct + slipPct;
  let haircutPct = 0;
  if (pool.apyMean30d != null) haircutPct += Math.abs(pool.apy - pool.apyMean30d) * 0.6;
  if (lp) haircutPct += Math.min(pool.apy * 0.25, 4);
  if (pool.predictedClass === "Down") haircutPct += 1.5;
  const netApy = pool.apy - entryCostPct * (365 / holdDays) - haircutPct;
  return { entryCostPct, haircutPct, netApy };
}

export function scorePools(pools: RawPool[], settings: Settings): ScoredPool[] {
  const capital = Math.max(100, settings.capital);
  const visible = pools.filter(
    (pool) => settings.chains.includes(pool.chain) && inUniverse(pool, settings.universe),
  );

  const draft = visible.map((pool) => {
    const byCapital = capital * (settings.maxPositionPct / 100);
    const byDepth = pool.tvlUsd * (MAX_DEPTH_PCT / 100);
    const ticket = Math.max(0, Math.min(byCapital, byDepth));
    const costs = costOf(pool, Math.max(ticket, 100), settings.holdDays);
    return { pool, ticket, ...costs };
  });

  const bySymbol = new Map<string, number[]>();
  for (const row of draft) {
    if (row.pool.tvlUsd < settings.minTvl) continue;
    const key = row.pool.symbol.toUpperCase();
    const list = bySymbol.get(key) ?? [];
    list.push(row.netApy);
    bySymbol.set(key, list);
  }

  return draft
    .map((row) => {
      const peers = bySymbol.get(row.pool.symbol.toUpperCase()) ?? [];
      const peerMedian = peers.length >= 3 ? median(peers) : null;
      const premium = peerMedian == null ? null : row.netApy - peerMedian;
      let reason: string | null = null;
      if (row.pool.tvlUsd < settings.minTvl) reason = "Poca liquidez para el mínimo";
      else if (row.pool.apy > MAX_APY) reason = "APY extremo, se descarta";
      else if (row.ticket < 100) reason = "El tope de profundidad deja el ticket en cero";
      else if (settings.avoidDown && row.pool.predictedClass === "Down")
        reason = "La tasa se prevé a la baja";
      else if (row.netApy < settings.minNetApy) reason = "El neto no cubre el umbral";
      const pass = reason == null;
      const score = row.netApy + Math.max(0, Math.min(premium ?? 0, 5)) * 0.4;
      return {
        ...row.pool,
        ticket: row.ticket,
        entryCostPct: row.entryCostPct,
        haircutPct: row.haircutPct,
        netApy: row.netApy,
        peerMedian,
        premium,
        pass,
        reason,
        score,
      };
    })
    .sort((a, b) => Number(b.pass) - Number(a.pass) || b.score - a.score);
}

export function allocate(scored: ScoredPool[], settings: Settings): Allocation[] {
  const capital = Math.max(100, settings.capital);
  const picks: Allocation[] = [];
  const perSymbol = new Map<string, number>();
  let spent = 0;

  for (const pool of scored) {
    if (!pool.pass || picks.length >= 4) continue;
    const key = pool.symbol.toUpperCase();
    if ((perSymbol.get(key) ?? 0) >= 2) continue;
    const room = capital - spent;
    const amount = Math.min(pool.ticket, room);
    if (amount < 100) continue;
    picks.push({ pool, amount });
    spent += amount;
    perSymbol.set(key, (perSymbol.get(key) ?? 0) + 1);
  }

  return picks;
}

export type PaperPosition = {
  id: string;
  chain: string;
  project: string;
  symbol: string;
  amount: number;
  grossApy: number;
  netApy: number;
  openedAt: number;
};

export type JournalEntry = { at: number; nav: number; note: string };

export type Book = {
  cash: number;
  positions: PaperPosition[];
  journal: JournalEntry[];
};

export function emptyBook(capital: number): Book {
  return { cash: capital, positions: [], journal: [] };
}

export function markPosition(position: PaperPosition, now: number) {
  const days = Math.max(0, (now - position.openedAt) / 86_400_000);
  return position.amount * (1 + (position.netApy / 100) * (days / 365));
}

export function bookNav(book: Book, now: number) {
  return book.cash + book.positions.reduce((sum, position) => sum + markPosition(position, now), 0);
}

export function rotateBook(book: Book, picks: Allocation[], capital: number, now: number): Book {
  const nav = bookNav(book, now);
  const base = Math.max(capital, 100);
  const scale = nav / base;
  let spent = 0;
  const positions: PaperPosition[] = picks.map((pick) => {
    const amount = pick.amount * scale;
    spent += amount;
    return {
      id: pick.pool.id,
      chain: pick.pool.chain,
      project: pick.pool.project,
      symbol: pick.pool.symbol,
      amount,
      grossApy: pick.pool.apy,
      netApy: pick.pool.netApy,
      openedAt: now,
    };
  });
  const cash = Math.max(0, nav - spent);
  const note =
    positions.length === 0
      ? "Sin rotación: ningún pool pasó el umbral"
      : `Rotación a ${positions.length} pool${positions.length === 1 ? "" : "s"}`;
  return {
    cash,
    positions,
    journal: [{ at: now, nav, note }, ...book.journal].slice(0, 8),
  };
}
