import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/pools-BBJVnWep.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var CHAINS = /* @__PURE__ */ new Set([
	"Ethereum",
	"Base",
	"Arbitrum",
	"OP Mainnet"
]);
var cache = null;
function num(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
var fetchPools_createServerFn_handler = createServerRpc({
	id: "a64e1353e48d4d04482eba5812db15f344f6f780ff4538e512ce83695ca83f2a",
	name: "fetchPools",
	filename: "src/lib/pools.ts"
}, (opts) => fetchPools.__executeServer(opts));
var fetchPools = createServerFn({ method: "GET" }).handler(fetchPools_createServerFn_handler, async () => {
	if (cache && Date.now() - cache.at < 3e5 && cache.payload.ok) return cache.payload;
	try {
		const response = await fetch("https://yields.llama.fi/pools", {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(25e3)
		});
		if (!response.ok) return {
			ok: false,
			error: "La fuente de pools no respondió. Prueba a actualizar."
		};
		const body = await response.json();
		const rows = Array.isArray(body.data) ? body.data : [];
		const pools = [];
		for (const row of rows) {
			if (!row || typeof row !== "object") continue;
			const item = row;
			const chain = typeof item.chain === "string" ? item.chain : "";
			const tvlUsd = num(item.tvlUsd) ?? 0;
			const apy = num(item.apy) ?? 0;
			const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
			if (!CHAINS.has(chain) || tvlUsd < 2e6 || apy < .2 || apy > 60) continue;
			if (item.outlier === true || !symbol || symbol.length > 32) continue;
			const id = typeof item.pool === "string" ? item.pool : "";
			const project = typeof item.project === "string" ? item.project : "pool";
			if (!id) continue;
			const predictions = item.predictions;
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
				predictedClass: typeof predictions?.predictedClass === "string" ? predictions.predictedClass : null
			});
		}
		pools.sort((a, b) => b.tvlUsd - a.tvlUsd);
		const payload = {
			ok: true,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			pools: pools.slice(0, 480)
		};
		cache = {
			at: Date.now(),
			payload
		};
		return payload;
	} catch {
		return {
			ok: false,
			error: "No se pudieron leer los pools. La red tardó demasiado."
		};
	}
});
//#endregion
export { fetchPools_createServerFn_handler };
