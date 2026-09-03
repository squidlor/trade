/** Number and time formatting. One place, so every panel prints a dollar the same way. */

export function usd(n: number | undefined, opts: { compact?: boolean } = {}): string {
  if (n === undefined || !Number.isFinite(n)) return '–';
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
 * Sub-cent prices as plain digits: four significant figures after the leading zeros, so
 * 0.000004021 reads as exactly that. (An earlier version compressed the zeros into a subscript
 * count, which people read as a typo.) `toFixed` rather than `toPrecision`, which switches to
 * exponent notation below 1e-7 and would print "4.021e-7" on a fresh launch.
 */
export function tiny(n: number): string {
  if (n === 0) return '0';
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 0.01) return n.toFixed(4).replace(/\.?0+$/, '');
  const decimals = Math.min(18, -Math.floor(Math.log10(abs)) + 3);
  return n.toFixed(decimals).replace(/0+$/, '');
}

export function amount(n: number | string | undefined, maxFrac = 4): string {
  if (n === undefined) return '–';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
  if (abs === 0) return '0';
  return tiny(v);
}

export function pct(n: number | undefined, signed = true): string {
  if (n === undefined || !Number.isFinite(n)) return '–';
  const s = n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return `${signed && n > 0 ? '+' : ''}${s}%`;
}

export const short = (a: string | undefined, head = 6, tail = 4): string => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : '–');

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
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
