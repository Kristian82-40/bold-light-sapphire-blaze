import { createServerFn } from "@tanstack/react-start";

export type RawPool = {
  id: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  stablecoin: boolean;
  ilRisk: "yes" | "no";
  apyMean30d: number | null;
  predictedClass: string | null;
};

export type PoolsPayload =
  | { ok: true; updatedAt: string; pools: RawPool[] }
  | { ok: false; error: string };

const CHAINS = new Set(["Ethereum", "Base", "Arbitrum", "OP Mainnet"]);

let cache: { at: number; payload: PoolsPayload } | null = null;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const fetchPools = createServerFn({ method: "GET" }).handler(async (): Promise<PoolsPayload> => {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000 && cache.payload.ok) {
    return cache.payload;
  }

  try {
    const response = await fetch("https://yields.llama.fi/pools", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      return { ok: false, error: "La fuente de pools no respondió. Prueba a actualizar." };
    }
    const body = (await response.json()) as { data?: unknown[] };
    const rows = Array.isArray(body.data) ? body.data : [];
    const pools: RawPool[] = [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const chain = typeof item.chain === "string" ? item.chain : "";
      const tvlUsd = num(item.tvlUsd) ?? 0;
      const apy = num(item.apy) ?? 0;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      if (!CHAINS.has(chain) || tvlUsd < 2_000_000 || apy < 0.2 || apy > 60) continue;
      if (item.outlier === true || !symbol || symbol.length > 32) continue;
      const id = typeof item.pool === "string" ? item.pool : "";
      const project = typeof item.project === "string" ? item.project : "pool";
      if (!id) continue;
      const predictions = item.predictions as { predictedClass?: unknown } | null;
      pools.push({
        id,
        chain,
        project,
        symbol,
        tvlUsd,
        apy,
        stablecoin: item.stablecoin === true,
        ilRisk: item.ilRisk === "yes" ? "yes" : "no",
        apyMean30d: num(item.apyMean30d),
        predictedClass:
          typeof predictions?.predictedClass === "string" ? predictions.predictedClass : null,
      });
    }

    pools.sort((a, b) => b.tvlUsd - a.tvlUsd);
    const payload: PoolsPayload = {
      ok: true,
      updatedAt: new Date().toISOString(),
      pools: pools.slice(0, 480),
    };
    cache = { at: Date.now(), payload };
    return payload;
  } catch {
    return { ok: false, error: "No se pudieron leer los pools. La red tardó demasiado." };
  }
});
