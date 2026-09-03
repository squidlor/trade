/**
 * A deterministic mark for a token that has no logo: two letters on a hue derived from its
 * address, so the same token always looks the same and two tokens rarely look alike.
 */
export function Avatar({ symbol, address, large }: { symbol: string; address: string; large?: boolean }) {
  let h = 0;
  for (const ch of address.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  const text = (symbol || address.slice(2, 4)).replace(/^\$/, '').slice(0, 2).toUpperCase();
  return (
    <span
      className={`avatar${large ? ' lg' : ''}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 52%), hsl(${hue2} 75% 40%))` }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
