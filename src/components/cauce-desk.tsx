import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Shield } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  allocate,
  bookNav,
  CHAIN_OPTIONS,
  DEFAULT_SETTINGS,
  emptyBook,
  markPosition,
  rotateBook,
  scorePools,
  type Book,
  type Settings,
  type Universe,
} from "@/lib/engine";
import { chainShort, compactUsd, pct, projectName, usd, whenLabel } from "@/lib/format";
import { fetchPools, type PoolsPayload } from "@/lib/pools";

const STORAGE_KEY = "cauce-desk-v1";

const TVL_STEPS = [
  { value: 2_000_000, label: "2 M" },
  { value: 5_000_000, label: "5 M" },
  { value: 20_000_000, label: "20 M" },
  { value: 100_000_000, label: "100 M" },
];

const HOLD_STEPS = [14, 30, 90];

const UNIVERSES: { id: Universe; label: string }[] = [
  { id: "estables", label: "Estables" },
  { id: "mayores", label: "Mayores" },
  { id: "todos", label: "Todos" },
];

export function CauceDesk({ initial }: { initial: PoolsPayload }) {
  const [payload, setPayload] = useState(initial);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [book, setBook] = useState<Book>(emptyBook(DEFAULT_SETTINGS.capital));
  const [now, setNow] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { settings?: Settings; book?: Book };
        if (saved.settings) setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        if (saved.book) setBook(saved.book);
      }
    } catch {
      /* ignore broken local state */
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (now == null) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, book }));
  }, [settings, book, now]);

  const pools = payload.ok ? payload.pools : [];
  const scored = useMemo(() => scorePools(pools, settings), [pools, settings]);
  const picks = useMemo(() => allocate(scored, settings), [scored, settings]);
  const passed = scored.filter((pool) => pool.pass).length;
  const deployed = picks.reduce((sum, pick) => sum + pick.amount, 0);
  const reserve = Math.max(0, settings.capital - deployed);
  const yearly = picks.reduce((sum, pick) => sum + pick.amount * (pick.pool.netApy / 100), 0);
  const periodPnl = yearly * (settings.holdDays / 365);
  const blended = settings.capital > 0 ? (yearly / settings.capital) * 100 : 0;
  const clock = now ?? 0;
  const nav = bookNav(book, clock || Date.now());
  const listed = showAll ? scored.slice(0, 80) : scored.slice(0, 8);
  const chartData = picks.map((pick) => ({
    name: pick.pool.symbol,
    Bruto: Number(pick.pool.apy.toFixed(2)),
    Neto: Number(Math.max(pick.pool.netApy, 0).toFixed(2)),
  }));

  function patch(partial: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...partial }));
  }

  function toggleChain(chain: string) {
    setSettings((current) => {
      const has = current.chains.includes(chain);
      if (has && current.chains.length === 1) return current;
      return {
        ...current,
        chains: has ? current.chains.filter((item) => item !== chain) : [...current.chains, chain],
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
      journal: [
        { at: stamp, nav: settings.capital, note: "Libro reiniciado" },
        ...book.journal,
      ].slice(0, 8),
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Cauce</p>
          <h1 className="mt-2 text-4xl leading-none text-fg sm:text-5xl">Mesa de liquidez</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-pretty text-muted">
            Lee pools públicos, resta gas, slippage y volatilidad, y solo propone capital donde el neto
            supera tu umbral.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-subtle tabular-nums">
            {payload.ok ? whenLabel(payload.updatedAt) : "sin datos"}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg transition-opacity duration-150 hover:opacity-80 disabled:opacity-50"
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            Actualizar
          </button>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pools leídos" value={payload.ok ? String(pools.length) : "—"} />
        <Stat label="Pasan el umbral" value={String(passed)} />
        <Stat label="Neto mezclado" value={pct(blended)} tone={blended > 0 ? "up" : "flat"} />
        <Stat
          label={`En ${settings.holdDays} días`}
          value={usd(periodPnl)}
          tone={periodPnl > 0 ? "up" : "flat"}
        />
      </section>

      {!payload.ok && (
        <p className="mt-6 rounded-3xl border border-border bg-surface px-5 py-4 text-sm text-down">
          {payload.error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="order-2 h-fit rounded-3xl border border-border bg-surface p-4 lg:sticky lg:top-4 lg:order-1">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <Shield className="size-4 text-muted" />
            Reglas de riesgo
          </div>

          <label className="mt-5 block text-xs text-muted" htmlFor="capital">
            Capital de trabajo
          </label>
          <input
            id="capital"
            inputMode="numeric"
            value={settings.capital}
            onChange={(event) => {
              const next = Number(event.target.value.replace(/[^\d]/g, ""));
              if (Number.isFinite(next)) patch({ capital: next });
            }}
            onBlur={() => patch({ capital: Math.min(5_000_000, Math.max(100, settings.capital || 100)) })}
            className="mt-2 h-11 w-full rounded-lg border border-border bg-bg px-3 text-fg tabular-nums outline-none focus:border-line"
          />

          <Slider
            label="Máximo por posición"
            value={settings.maxPositionPct}
            min={10}
            max={50}
            step={5}
            format={(value) => `${value} %`}
            onChange={(maxPositionPct) => patch({ maxPositionPct })}
          />

          <Slider
            label="APY neto mínimo"
            value={settings.minNetApy}
            min={0}
            max={12}
            step={0.5}
            format={(value) => pct(value)}
            onChange={(minNetApy) => patch({ minNetApy })}
          />

          <p className="mt-5 text-xs text-muted">Liquidez mínima del pool</p>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {TVL_STEPS.map((step) => (
              <Seg
                key={step.value}
                active={settings.minTvl === step.value}
                onClick={() => patch({ minTvl: step.value })}
                label={step.label}
              />
            ))}
          </div>

          <p className="mt-5 text-xs text-muted">Permanencia para anualizar costes</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {HOLD_STEPS.map((days) => (
              <Seg
                key={days}
                active={settings.holdDays === days}
                onClick={() => patch({ holdDays: days })}
                label={`${days} d`}
              />
            ))}
          </div>

          <p className="mt-5 text-xs text-muted">Universo</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {UNIVERSES.map((item) => (
              <Seg
                key={item.id}
                active={settings.universe === item.id}
                onClick={() => patch({ universe: item.id })}
                label={item.label}
              />
            ))}
          </div>

          <p className="mt-5 text-xs text-muted">Cadenas</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {CHAIN_OPTIONS.map((chain) => (
              <Seg
                key={chain}
                active={settings.chains.includes(chain)}
                onClick={() => toggleChain(chain)}
                label={chainShort(chain)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => patch({ avoidDown: !settings.avoidDown })}
            className="mt-5 flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-bg px-3 text-left text-sm text-fg"
            aria-pressed={settings.avoidDown}
          >
            Evitar tasas a la baja
            <span className={settings.avoidDown ? "text-up" : "text-subtle"}>
              {settings.avoidDown ? "Sí" : "No"}
            </span>
          </button>

          <p className="mt-4 text-xs leading-relaxed text-subtle">
            El neto resta el coste de entrar (gas y slippage) anualizado al plazo, más un recorte si la tasa
            se desvía de su media de 30 días o el pool tiene riesgo de pérdida impermanente.
          </p>
        </aside>

        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
          <section className="rounded-3xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl text-fg">Propuesta</h2>
                <p className="mt-1 text-sm text-muted">
                  Hasta cuatro pools. Máximo dos del mismo activo. Reserva {usd(reserve)} sin desplegar.
                </p>
              </div>
              <button
                type="button"
                onClick={apply}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-85"
              >
                Aplicar rotación
              </button>
            </div>

            {picks.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-border bg-bg px-4 py-6 text-sm text-muted">
                Ningún pool cubre el umbral con este capital. Baja el APY mínimo, alarga el plazo o abre el
                universo.
              </p>
            ) : (
              <ul className="mt-5 flex flex-col gap-2">
                {picks.map((pick) => (
                  <li
                    key={pick.pool.id}
                    className="grid gap-2 rounded-2xl border border-border bg-bg px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{pick.pool.symbol}</p>
                      <p className="truncate text-sm text-muted">
                        {projectName(pick.pool.project)} · {chainShort(pick.pool.chain)}
                        {pick.pool.premium != null && pick.pool.premium >= 1.25
                          ? ` · prima ${pct(pick.pool.premium)}`
                          : ""}
                      </p>
                    </div>
                    <Metric k="Asignado" v={usd(pick.amount)} />
                    <Metric k="Bruto" v={pct(pick.pool.apy)} />
                    <Metric k="Neto" v={pct(pick.pool.netApy)} up />
                  </li>
                ))}
              </ul>
            )}

            {chartData.length > 0 && (
              <div className="mt-5 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={4}>
                    <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      cursor={{ fill: "var(--color-raised)" }}
                      contentStyle={{
                        background: "var(--color-raised)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-fg)",
                      }}
                    />
                    <Bar dataKey="Bruto" fill="var(--color-line)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Neto" fill="var(--color-up)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl text-fg">Libro de papel</h2>
                <p className="mt-1 text-sm text-muted tabular-nums">
                  NAV {usd(now == null ? book.cash : nav, 2)} · no mueve fondos reales
                </p>
              </div>
              <button
                type="button"
                onClick={resetBook}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-fg transition-opacity duration-150 hover:opacity-80"
              >
                Reiniciar libro
              </button>
            </div>

            {book.positions.length === 0 ? (
              <p className="mt-5 text-sm text-muted">
                Todo el libro está en reserva. Aplica una rotación para abrir posiciones simuladas. El devengo
                usa la tasa neta del momento de entrada, no una garantía.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {book.positions.map((position) => {
                  const marked = now == null ? position.amount : markPosition(position, now);
                  const gained = marked - position.amount;
                  return (
                    <li
                      key={position.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{position.symbol}</p>
                        <p className="truncate text-sm text-muted">
                          {projectName(position.project)} · {chainShort(position.chain)} · {pct(position.netApy)}
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="text-fg">{usd(marked, 2)}</p>
                        <p className={gained >= 0 ? "text-sm text-up" : "text-sm text-down"}>
                          {gained >= 0 ? "+" : ""}
                          {usd(gained, 2)}
                        </p>
                      </div>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between px-4 py-2 text-sm text-muted">
                  <span>Reserva</span>
                  <span className="tabular-nums text-fg">{usd(book.cash, 2)}</span>
                </li>
              </ul>
            )}

            {book.journal.length > 0 && (
              <ol className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
                {book.journal.map((entry) => (
                  <li key={entry.at} className="flex justify-between gap-3 text-xs text-subtle">
                    <span>{entry.note}</span>
                    <span className="shrink-0 tabular-nums">{usd(entry.nav)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl text-fg">Universo</h2>
            <p className="mt-1 text-sm text-muted">
              Misma lectura para todos. La prima es el neto frente a la mediana de pools con el mismo símbolo.
            </p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {listed.map((pool) => (
            <li
              key={pool.id}
              className="grid gap-1 rounded-2xl border border-border bg-bg px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.7fr))] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{pool.symbol}</p>
                <p className="truncate text-sm text-muted">
                  {projectName(pool.project)} · {chainShort(pool.chain)} · {compactUsd(pool.tvlUsd)}
                </p>
              </div>
              <Metric k="Bruto" v={pct(pool.apy)} />
              <Metric k="Neto" v={pct(pool.netApy)} up={pool.netApy >= settings.minNetApy} />
              <Metric k="Prima" v={pool.premium == null ? "—" : pct(pool.premium)} />
              <p className={`text-sm sm:text-right ${pool.pass ? "text-up" : "text-subtle"}`}>
                {pool.pass ? "Pasa" : pool.reason}
              </p>
            </li>
          ))}
        </ul>
        {scored.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-3 h-11 text-sm font-medium text-muted"
          >
            {showAll ? "Ver menos" : `Ver más (${Math.min(scored.length, 80) - 8})`}
          </button>
        )}
      </section>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-subtle">
        Simulación con datos públicos de rendimiento. No es una orden, no custodia activos y no promete el
        APY publicado: ese número baja cuando el pool es fino, el gas pesa o la tasa ya se está moviendo.
      </p>
    </main>
  );
}

function Stat({ label, value, tone = "flat" }: { label: string; value: string; tone?: "up" | "flat" }) {
  return (
    <div className="rounded-3xl border border-border bg-surface px-4 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 text-2xl tabular-nums ${tone === "up" ? "text-up" : "text-fg"}`}>{value}</p>
    </div>
  );
}

function Metric({ k, v, up = false }: { k: string; v: string; up?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 sm:block">
      <span className="text-xs text-subtle">{k}</span>
      <span className={`block tabular-nums sm:mt-1 ${up ? "text-up" : "text-fg"}`}>{v}</span>
    </p>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="flex items-center justify-between text-xs text-muted">
        {label}
        <span className="tabular-nums text-fg">{format(value)}</span>
      </span>
      <input
        className="range mt-3"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Seg({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 rounded-lg px-2 text-sm font-medium transition-opacity duration-150 ${
        active ? "bg-accent text-accent-fg" : "bg-bg text-muted hover:opacity-80"
      }`}
    >
      {label}
    </button>
  );
}
