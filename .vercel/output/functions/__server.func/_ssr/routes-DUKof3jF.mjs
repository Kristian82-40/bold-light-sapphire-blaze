import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as Shield, r as RefreshCw } from "../_libs/lucide-react.mjs";
import { n as Route, r as fetchPools } from "./router-CyutpR2S.mjs";
import { a as ResponsiveContainer, i as Bar, n as YAxis, o as Tooltip, r as XAxis, t as BarChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DUKof3jF.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var CHAIN_OPTIONS = [
	"Ethereum",
	"Base",
	"Arbitrum",
	"OP Mainnet"
];
var DEFAULT_SETTINGS = {
	capital: 1e4,
	maxPositionPct: 25,
	minTvl: 5e6,
	minNetApy: 1.5,
	holdDays: 30,
	universe: "estables",
	chains: [...CHAIN_OPTIONS],
	avoidDown: true
};
var GAS_USD = {
	Ethereum: 7,
	Base: .08,
	Arbitrum: .15,
	"OP Mainnet": .1
};
var MAX_APY = 35;
var MAX_DEPTH_PCT = 1;
var MAJOR = /(^|[^A-Z])(ETH|WETH|WSTETH|WEETH|RETH|CBETH|RSETH|BTC|WBTC|CBBTC|TBTC|SOL|WSOL)([^A-Z]|$)/;
function inUniverse(pool, universe) {
	if (universe === "todos") return true;
	if (universe === "estables") return pool.stablecoin;
	return pool.stablecoin || MAJOR.test(pool.symbol.toUpperCase());
}
function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function costOf(pool, ticket, holdDays) {
	const gasPct = (GAS_USD[pool.chain] ?? .2) / Math.max(ticket, 1) * 100;
	const depth = ticket / Math.max(pool.tvlUsd, 1);
	const lp = pool.ilRisk === "yes";
	const entryCostPct = gasPct + ((lp ? .06 : .008) + depth * (lp ? 25 : 6));
	let haircutPct = 0;
	if (pool.apyMean30d != null) haircutPct += Math.abs(pool.apy - pool.apyMean30d) * .6;
	if (lp) haircutPct += Math.min(pool.apy * .25, 4);
	if (pool.predictedClass === "Down") haircutPct += 1.5;
	const netApy = pool.apy - entryCostPct * (365 / holdDays) - haircutPct;
	return {
		entryCostPct,
		haircutPct,
		netApy
	};
}
function scorePools(pools, settings) {
	const capital = Math.max(100, settings.capital);
	const draft = pools.filter((pool) => settings.chains.includes(pool.chain) && inUniverse(pool, settings.universe)).map((pool) => {
		const byCapital = capital * (settings.maxPositionPct / 100);
		const byDepth = pool.tvlUsd * (MAX_DEPTH_PCT / 100);
		const ticket = Math.max(0, Math.min(byCapital, byDepth));
		return {
			pool,
			ticket,
			...costOf(pool, Math.max(ticket, 100), settings.holdDays)
		};
	});
	const bySymbol = /* @__PURE__ */ new Map();
	for (const row of draft) {
		if (row.pool.tvlUsd < settings.minTvl) continue;
		const key = row.pool.symbol.toUpperCase();
		const list = bySymbol.get(key) ?? [];
		list.push(row.netApy);
		bySymbol.set(key, list);
	}
	return draft.map((row) => {
		const peers = bySymbol.get(row.pool.symbol.toUpperCase()) ?? [];
		const peerMedian = peers.length >= 3 ? median(peers) : null;
		const premium = peerMedian == null ? null : row.netApy - peerMedian;
		let reason = null;
		if (row.pool.tvlUsd < settings.minTvl) reason = "Poca liquidez para el mínimo";
		else if (row.pool.apy > MAX_APY) reason = "APY extremo, se descarta";
		else if (row.ticket < 100) reason = "El tope de profundidad deja el ticket en cero";
		else if (settings.avoidDown && row.pool.predictedClass === "Down") reason = "La tasa se prevé a la baja";
		else if (row.netApy < settings.minNetApy) reason = "El neto no cubre el umbral";
		const pass = reason == null;
		const score = row.netApy + Math.max(0, Math.min(premium ?? 0, 5)) * .4;
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
			score
		};
	}).sort((a, b) => Number(b.pass) - Number(a.pass) || b.score - a.score);
}
function allocate(scored, settings) {
	const capital = Math.max(100, settings.capital);
	const picks = [];
	const perSymbol = /* @__PURE__ */ new Map();
	let spent = 0;
	for (const pool of scored) {
		if (!pool.pass || picks.length >= 4) continue;
		const key = pool.symbol.toUpperCase();
		if ((perSymbol.get(key) ?? 0) >= 2) continue;
		const room = capital - spent;
		const amount = Math.min(pool.ticket, room);
		if (amount < 100) continue;
		picks.push({
			pool,
			amount
		});
		spent += amount;
		perSymbol.set(key, (perSymbol.get(key) ?? 0) + 1);
	}
	return picks;
}
function emptyBook(capital) {
	return {
		cash: capital,
		positions: [],
		journal: []
	};
}
function markPosition(position, now) {
	const days = Math.max(0, (now - position.openedAt) / 864e5);
	return position.amount * (1 + position.netApy / 100 * (days / 365));
}
function bookNav(book, now) {
	return book.cash + book.positions.reduce((sum, position) => sum + markPosition(position, now), 0);
}
function rotateBook(book, picks, capital, now) {
	const nav = bookNav(book, now);
	const scale = nav / Math.max(capital, 100);
	let spent = 0;
	const positions = picks.map((pick) => {
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
			openedAt: now
		};
	});
	return {
		cash: Math.max(0, nav - spent),
		positions,
		journal: [{
			at: now,
			nav,
			note: positions.length === 0 ? "Sin rotación: ningún pool pasó el umbral" : `Rotación a ${positions.length} pool${positions.length === 1 ? "" : "s"}`
		}, ...book.journal].slice(0, 8)
	};
}
function group(value, digits) {
	const negative = value < 0;
	const [whole, frac = ""] = Math.abs(value).toFixed(digits).split(".");
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	const body = digits > 0 ? `${grouped},${frac}` : grouped;
	return `${negative ? "-" : ""}${body}`;
}
function usd(value, digits = value >= 1e3 ? 0 : 2) {
	return `${group(value, digits)} US$`;
}
function compactUsd(value) {
	const abs = Math.abs(value);
	if (abs >= 1e9) return `${group(value / 1e9, 1)} mil M`;
	if (abs >= 1e7) return `${group(value / 1e6, 0)} M`;
	if (abs >= 1e6) return `${group(value / 1e6, 1)} M`;
	if (abs >= 1e3) return `${group(value / 1e3, 0)} mil`;
	return usd(value, 0);
}
function pct(value) {
	return `${group(value, 2)} %`;
}
function projectName(project) {
	return project.split("-").map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(" ");
}
function chainShort(chain) {
	if (chain === "OP Mainnet") return "OP";
	if (chain === "Arbitrum") return "Arb";
	if (chain === "Ethereum") return "ETH";
	return chain;
}
var MONTHS = [
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic"
];
function whenLabel(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "ahora";
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hour = String(date.getUTCHours()).padStart(2, "0");
	const minute = String(date.getUTCMinutes()).padStart(2, "0");
	return `${day} ${MONTHS[date.getUTCMonth()]} ${hour}:${minute} UTC`;
}
var STORAGE_KEY = "cauce-desk-v1";
var TVL_STEPS = [
	{
		value: 2e6,
		label: "2 M"
	},
	{
		value: 5e6,
		label: "5 M"
	},
	{
		value: 2e7,
		label: "20 M"
	},
	{
		value: 1e8,
		label: "100 M"
	}
];
var HOLD_STEPS = [
	14,
	30,
	90
];
var UNIVERSES = [
	{
		id: "estables",
		label: "Estables"
	},
	{
		id: "mayores",
		label: "Mayores"
	},
	{
		id: "todos",
		label: "Todos"
	}
];
function CauceDesk({ initial }) {
	const [payload, setPayload] = (0, import_react.useState)(initial);
	const [settings, setSettings] = (0, import_react.useState)(DEFAULT_SETTINGS);
	const [book, setBook] = (0, import_react.useState)(emptyBook(DEFAULT_SETTINGS.capital));
	const [now, setNow] = (0, import_react.useState)(null);
	const [refreshing, setRefreshing] = (0, import_react.useState)(false);
	const [showAll, setShowAll] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const saved = JSON.parse(raw);
				if (saved.settings) setSettings({
					...DEFAULT_SETTINGS,
					...saved.settings
				});
				if (saved.book) setBook(saved.book);
			}
		} catch {}
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 3e4);
		return () => window.clearInterval(timer);
	}, []);
	(0, import_react.useEffect)(() => {
		if (now == null) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({
			settings,
			book
		}));
	}, [
		settings,
		book,
		now
	]);
	const pools = payload.ok ? payload.pools : [];
	const scored = (0, import_react.useMemo)(() => scorePools(pools, settings), [pools, settings]);
	const picks = (0, import_react.useMemo)(() => allocate(scored, settings), [scored, settings]);
	const passed = scored.filter((pool) => pool.pass).length;
	const deployed = picks.reduce((sum, pick) => sum + pick.amount, 0);
	const reserve = Math.max(0, settings.capital - deployed);
	const yearly = picks.reduce((sum, pick) => sum + pick.amount * (pick.pool.netApy / 100), 0);
	const periodPnl = yearly * (settings.holdDays / 365);
	const blended = settings.capital > 0 ? yearly / settings.capital * 100 : 0;
	const nav = bookNav(book, (now ?? 0) || Date.now());
	const listed = showAll ? scored.slice(0, 80) : scored.slice(0, 8);
	const chartData = picks.map((pick) => ({
		name: pick.pool.symbol,
		Bruto: Number(pick.pool.apy.toFixed(2)),
		Neto: Number(Math.max(pick.pool.netApy, 0).toFixed(2))
	}));
	function patch(partial) {
		setSettings((current) => ({
			...current,
			...partial
		}));
	}
	function toggleChain(chain) {
		setSettings((current) => {
			const has = current.chains.includes(chain);
			if (has && current.chains.length === 1) return current;
			return {
				...current,
				chains: has ? current.chains.filter((item) => item !== chain) : [...current.chains, chain]
			};
		});
	}
	async function refresh() {
		setRefreshing(true);
		try {
			setPayload(await fetchPools());
		} finally {
			setRefreshing(false);
		}
	}
	function apply() {
		const stamp = Date.now();
		setNow(stamp);
		setBook((current) => rotateBook(current, picks, settings.capital, stamp));
	}
	function resetBook() {
		const stamp = Date.now();
		setNow(stamp);
		setBook({
			...emptyBook(settings.capital),
			journal: [{
				at: stamp,
				nav: settings.capital,
				note: "Libro reiniciado"
			}, ...book.journal].slice(0, 8)
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "max-w-xl",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs font-medium tracking-widest text-muted uppercase",
							children: "Cauce"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 text-4xl leading-none text-fg sm:text-5xl",
							children: "Mesa de liquidez"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 max-w-lg text-base leading-relaxed text-pretty text-muted",
							children: "Lee pools públicos, resta gas, slippage y volatilidad, y solo propone capital donde el neto supera tu umbral."
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-subtle tabular-nums",
						children: payload.ok ? whenLabel(payload.updatedAt) : "sin datos"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void refresh(),
						disabled: refreshing,
						className: "inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg transition-opacity duration-150 hover:opacity-80 disabled:opacity-50",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: refreshing ? "size-4 animate-spin" : "size-4" }), "Actualizar"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Pools leídos",
						value: payload.ok ? String(pools.length) : "—"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Pasan el umbral",
						value: String(passed)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Neto mezclado",
						value: pct(blended),
						tone: blended > 0 ? "up" : "flat"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: `En ${settings.holdDays} días`,
						value: usd(periodPnl),
						tone: periodPnl > 0 ? "up" : "flat"
					})
				]
			}),
			!payload.ok && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-6 rounded-3xl border border-border bg-surface px-5 py-4 text-sm text-down",
				children: payload.error
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "order-2 h-fit rounded-3xl border border-border bg-surface p-4 lg:sticky lg:top-4 lg:order-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-sm font-medium text-fg",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shield, { className: "size-4 text-muted" }), "Reglas de riesgo"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "mt-5 block text-xs text-muted",
							htmlFor: "capital",
							children: "Capital de trabajo"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "capital",
							inputMode: "numeric",
							value: settings.capital,
							onChange: (event) => {
								const next = Number(event.target.value.replace(/[^\d]/g, ""));
								if (Number.isFinite(next)) patch({ capital: next });
							},
							onBlur: () => patch({ capital: Math.min(5e6, Math.max(100, settings.capital || 100)) }),
							className: "mt-2 h-11 w-full rounded-lg border border-border bg-bg px-3 text-fg tabular-nums outline-none focus:border-line"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
							label: "Máximo por posición",
							value: settings.maxPositionPct,
							min: 10,
							max: 50,
							step: 5,
							format: (value) => `${value} %`,
							onChange: (maxPositionPct) => patch({ maxPositionPct })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
							label: "APY neto mínimo",
							value: settings.minNetApy,
							min: 0,
							max: 12,
							step: .5,
							format: (value) => pct(value),
							onChange: (minNetApy) => patch({ minNetApy })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-xs text-muted",
							children: "Liquidez mínima del pool"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 grid grid-cols-4 gap-1",
							children: TVL_STEPS.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Seg, {
								active: settings.minTvl === step.value,
								onClick: () => patch({ minTvl: step.value }),
								label: step.label
							}, step.value))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-xs text-muted",
							children: "Permanencia para anualizar costes"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 grid grid-cols-3 gap-1",
							children: HOLD_STEPS.map((days) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Seg, {
								active: settings.holdDays === days,
								onClick: () => patch({ holdDays: days }),
								label: `${days} d`
							}, days))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-xs text-muted",
							children: "Universo"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 grid grid-cols-3 gap-1",
							children: UNIVERSES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Seg, {
								active: settings.universe === item.id,
								onClick: () => patch({ universe: item.id }),
								label: item.label
							}, item.id))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 text-xs text-muted",
							children: "Cadenas"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2 flex flex-wrap gap-1",
							children: CHAIN_OPTIONS.map((chain) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Seg, {
								active: settings.chains.includes(chain),
								onClick: () => toggleChain(chain),
								label: chainShort(chain)
							}, chain))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => patch({ avoidDown: !settings.avoidDown }),
							className: "mt-5 flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-bg px-3 text-left text-sm text-fg",
							"aria-pressed": settings.avoidDown,
							children: ["Evitar tasas a la baja", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: settings.avoidDown ? "text-up" : "text-subtle",
								children: settings.avoidDown ? "Sí" : "No"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-xs leading-relaxed text-subtle",
							children: "El neto resta el coste de entrar (gas y slippage) anualizado al plazo, más un recorte si la tasa se desvía de su media de 30 días o el pool tiene riesgo de pérdida impermanente."
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "order-1 flex min-w-0 flex-col gap-6 lg:order-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-3xl border border-border bg-surface p-4 sm:p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-2xl text-fg",
									children: "Propuesta"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-sm text-muted",
									children: [
										"Hasta cuatro pools. Máximo dos del mismo activo. Reserva ",
										usd(reserve),
										" sin desplegar."
									]
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: apply,
									className: "inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-85",
									children: "Aplicar rotación"
								})]
							}),
							picks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-6 rounded-2xl border border-border bg-bg px-4 py-6 text-sm text-muted",
								children: "Ningún pool cubre el umbral con este capital. Baja el APY mínimo, alarga el plazo o abre el universo."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-5 flex flex-col gap-2",
								children: picks.map((pick) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "grid gap-2 rounded-2xl border border-border bg-bg px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:items-center",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "truncate font-medium text-fg",
												children: pick.pool.symbol
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "truncate text-sm text-muted",
												children: [
													projectName(pick.pool.project),
													" · ",
													chainShort(pick.pool.chain),
													pick.pool.premium != null && pick.pool.premium >= 1.25 ? ` · prima ${pct(pick.pool.premium)}` : ""
												]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
											k: "Asignado",
											v: usd(pick.amount)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
											k: "Bruto",
											v: pct(pick.pool.apy)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
											k: "Neto",
											v: pct(pick.pool.netApy),
											up: true
										})
									]
								}, pick.pool.id))
							}),
							chartData.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-5 h-52",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
									width: "100%",
									height: "100%",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(BarChart, {
										data: chartData,
										barGap: 4,
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
												dataKey: "name",
												tick: {
													fill: "var(--color-muted)",
													fontSize: 12
												},
												axisLine: false,
												tickLine: false
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
												tick: {
													fill: "var(--color-subtle)",
													fontSize: 12
												},
												axisLine: false,
												tickLine: false,
												width: 36
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
												cursor: { fill: "var(--color-raised)" },
												contentStyle: {
													background: "var(--color-raised)",
													border: "1px solid var(--color-border)",
													borderRadius: 12,
													color: "var(--color-fg)"
												}
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, {
												dataKey: "Bruto",
												fill: "var(--color-line)",
												radius: [
													4,
													4,
													0,
													0
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, {
												dataKey: "Neto",
												fill: "var(--color-up)",
												radius: [
													4,
													4,
													0,
													0
												]
											})
										]
									})
								})
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-3xl border border-border bg-surface p-4 sm:p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-2xl text-fg",
									children: "Libro de papel"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-sm text-muted tabular-nums",
									children: [
										"NAV ",
										usd(now == null ? book.cash : nav, 2),
										" · no mueve fondos reales"
									]
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: resetBook,
									className: "inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-fg transition-opacity duration-150 hover:opacity-80",
									children: "Reiniciar libro"
								})]
							}),
							book.positions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-5 text-sm text-muted",
								children: "Todo el libro está en reserva. Aplica una rotación para abrir posiciones simuladas. El devengo usa la tasa neta del momento de entrada, no una garantía."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
								className: "mt-4 flex flex-col gap-2",
								children: [book.positions.map((position) => {
									const marked = now == null ? position.amount : markPosition(position, now);
									const gained = marked - position.amount;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
										className: "flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg px-4 py-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "truncate font-medium text-fg",
												children: position.symbol
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "truncate text-sm text-muted",
												children: [
													projectName(position.project),
													" · ",
													chainShort(position.chain),
													" · ",
													pct(position.netApy)
												]
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-right tabular-nums",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-fg",
												children: usd(marked, 2)
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: gained >= 0 ? "text-sm text-up" : "text-sm text-down",
												children: [gained >= 0 ? "+" : "", usd(gained, 2)]
											})]
										})]
									}, position.id);
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "flex items-center justify-between px-4 py-2 text-sm text-muted",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Reserva" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "tabular-nums text-fg",
										children: usd(book.cash, 2)
									})]
								})]
							}),
							book.journal.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
								className: "mt-4 flex flex-col gap-1 border-t border-border pt-3",
								children: book.journal.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "flex justify-between gap-3 text-xs text-subtle",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: entry.note }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "shrink-0 tabular-nums",
										children: usd(entry.nav)
									})]
								}, entry.at))
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-6 rounded-3xl border border-border bg-surface p-4 sm:p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-end justify-between gap-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-2xl text-fg",
							children: "Universo"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: "Misma lectura para todos. La prima es el neto frente a la mediana de pools con el mismo símbolo."
						})] })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 flex flex-col gap-2",
						children: listed.map((pool) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "grid gap-1 rounded-2xl border border-border bg-bg px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.7fr))] sm:items-center",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate font-medium text-fg",
										children: pool.symbol
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "truncate text-sm text-muted",
										children: [
											projectName(pool.project),
											" · ",
											chainShort(pool.chain),
											" · ",
											compactUsd(pool.tvlUsd)
										]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
									k: "Bruto",
									v: pct(pool.apy)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
									k: "Neto",
									v: pct(pool.netApy),
									up: pool.netApy >= settings.minNetApy
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
									k: "Prima",
									v: pool.premium == null ? "—" : pct(pool.premium)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: `text-sm sm:text-right ${pool.pass ? "text-up" : "text-subtle"}`,
									children: pool.pass ? "Pasa" : pool.reason
								})
							]
						}, pool.id))
					}),
					scored.length > 8 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setShowAll((value) => !value),
						className: "mt-3 h-11 text-sm font-medium text-muted",
						children: showAll ? "Ver menos" : `Ver más (${Math.min(scored.length, 80) - 8})`
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-8 max-w-2xl text-xs leading-relaxed text-subtle",
				children: "Simulación con datos públicos de rendimiento. No es una orden, no custodia activos y no promete el APY publicado: ese número baja cuando el pool es fino, el gas pesa o la tasa ya se está moviendo."
			})
		]
	});
}
function Stat({ label, value, tone = "flat" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-3xl border border-border bg-surface px-4 py-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: `mt-2 text-2xl tabular-nums ${tone === "up" ? "text-up" : "text-fg"}`,
			children: value
		})]
	});
}
function Metric({ k, v, up = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "flex items-baseline justify-between gap-3 sm:block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs text-subtle",
			children: k
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: `block tabular-nums sm:mt-1 ${up ? "text-up" : "text-fg"}`,
			children: v
		})]
	});
}
function Slider({ label, value, min, max, step, format, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "mt-5 block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center justify-between text-xs text-muted",
			children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "tabular-nums text-fg",
				children: format(value)
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			className: "range mt-3",
			type: "range",
			min,
			max,
			step,
			value,
			onChange: (event) => onChange(Number(event.target.value))
		})]
	});
}
function Seg({ active, onClick, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		"aria-pressed": active,
		className: `h-11 rounded-lg px-2 text-sm font-medium transition-opacity duration-150 ${active ? "bg-accent text-accent-fg" : "bg-bg text-muted hover:opacity-80"}`,
		children: label
	});
}
function Home() {
	const initial = Route.useLoaderData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CauceDesk, { initial });
}
//#endregion
export { Home as component };
