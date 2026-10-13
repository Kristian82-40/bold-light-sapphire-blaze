function group(value: number, digits: number) {
  const negative = value < 0;
  const [whole, frac = ""] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = digits > 0 ? `${grouped},${frac}` : grouped;
  return `${negative ? "-" : ""}${body}`;
}

export function usd(value: number, digits = value >= 1000 ? 0 : 2) {
  return `${group(value, digits)} US$`;
}

export function compactUsd(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${group(value / 1_000_000_000, 1)} mil M`;
  if (abs >= 10_000_000) return `${group(value / 1_000_000, 0)} M`;
  if (abs >= 1_000_000) return `${group(value / 1_000_000, 1)} M`;
  if (abs >= 1_000) return `${group(value / 1_000, 0)} mil`;
  return usd(value, 0);
}

export function pct(value: number) {
  return `${group(value, 2)} %`;
}

export function projectName(project: string) {
  return project
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function chainShort(chain: string) {
  if (chain === "OP Mainnet") return "OP";
  if (chain === "Arbitrum") return "Arb";
  if (chain === "Ethereum") return "ETH";
  return chain;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "ahora";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${MONTHS[date.getUTCMonth()]} ${hour}:${minute} UTC`;
}
