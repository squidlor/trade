/** Number and time formatting. One place, so every panel prints a dollar the same way. */

export function usd(n: number | undefined, opts: { compact?: boolean } = {}): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (opts.compact !== false) {
    if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  }
  if (abs >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  if (abs === 0) return '$0';
  return `$${tiny(n)}`;
}

/**
 * Sub-cent prices without a wall of zeros: "0.0₆4057" means six zeros then 4057. The subscript
 * count is what every serious DEX UI does for launch-stage tokens, whose prices start around 1e-6.
 */
export function tiny(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 0.01) return n.toFixed(4);
  const s = n.toFixed(20);
  const m = /^0\.(0*)(\d+)$/.exec(s);
  if (!m) return n.toPrecision(4);
  const zeros = m[1]?.length ?? 0;
  const digits = (m[2] ?? '').slice(0, 4).replace(/0+$/, '') || '0';
  if (zeros < 3) return n.toPrecision(4).replace(/\.?0+$/, '');
  const sub = String(zeros).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)] ?? d);
  return `0.0${sub}${digits}`;
}

export function amount(n: number | string | undefined, maxFrac = 4): string {
  if (n === undefined) return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
  if (abs === 0) return '0';
  return tiny(v);
}

export function pct(n: number | undefined, signed = true): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const s = n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return `${signed && n > 0 ? '+' : ''}${s}%`;
}

export const short = (a: string | undefined, head = 6, tail = 4): string => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : '—');

export function ago(iso: string | number | undefined): string {
  if (iso === undefined) return '';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function dateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
