import { useState } from 'react';
import { Avatar } from './Avatar';

/**
 * A token's image when one is known, its monogram when not, and the monogram again if the image
 * fails to load. Same box, same radius, so a row of tokens lines up whichever it is.
 */
export function TokenLogo({ src, symbol, address, large, size }: { src?: string | undefined; symbol: string; address: string; large?: boolean; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Avatar symbol={symbol} address={address} {...(large ? { large } : {})} />;
  const px = size ?? (large ? 56 : 36);
  return <img className={`avatar img${large ? ' lg' : ''}`} src={src} alt="" width={px} height={px} style={{ width: px, height: px }} onError={() => setBroken(true)} loading="lazy" />;
}

/** A small round stock logo for chips and rows. */
export function StockLogo({ src, symbol, size = 16 }: { src?: string | undefined; symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="stock-dot" style={{ width: size, height: size, fontSize: Math.max(7, size * 0.5) }}>{symbol.slice(0, 1)}</span>;
  return <img className="stock-dot img" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} loading="lazy" />;
}
