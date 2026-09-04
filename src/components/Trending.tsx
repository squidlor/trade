import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { BoardRow } from '../lib/api';
import { ago, pct, usd } from '../lib/format';
import { TokenLogo } from './TokenLogo';

/* ── The Base-wide trending list, switched off 2026-09-04 ───────────────────────────────────────
 *
 * This section used to carry a second tab listing GeckoTerminal's trending pools across all of
 * Base. The user's call: this page is about tokens launched on Squidlor, and a rail of other
 * people's tokens sends attention off the platform.
 *
 * The server side is untouched and still serves it, so restoring this is a UI change only:
 *   - `GET /api/dex/trending?window=1h|6h|24h&rank=trending|volume|new&limit=`
 *   - `fetchTrending`, `TREND_WINDOWS`, `TrendWindow`, `TrendingToken` in ../lib/api
 * The commented block at the foot of this file is the row renderer it used.
 *
 * import { useQuery } from '@tanstack/react-query';
 * import { TREND_WINDOWS, fetchTrending, type TrendWindow, type TrendingToken } from '../lib/api';
 * import { short } from '../lib/format';
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

type Tab = 'active' | 'movers';

/**
 * What is moving ON SQUIDLOR. The rows are the board's own launches, already fetched by the page,
 * ordered two ways: most traded in 24h, and biggest 24h move. No extra request, and nothing here
 * is a token we did not launch.
 *
 * A launch with no DEX print yet still appears (that is most of a new board), showing its on-chain
 * price and age rather than being filtered out into an empty section.
 */
export function Trending({ rows }: { rows: BoardRow[] }) {
  const [tab, setTab] = useState<Tab>('active');
  const nav = useNavigate();

  const ordered = useMemo(() => {
    const list = [...rows];
    if (tab === 'active') {
      list.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0) || (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    } else {
      // Rows with a real 24h print first; the rest keep their order behind them rather than
      // sorting as if a missing move were zero.
      list.sort((a, b) => {
        const av = a.change24hPct;
        const bv = b.change24hPct;
        if (av === undefined && bv === undefined) return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return bv - av;
      });
    }
    return list.slice(0, 12);
  }, [rows, tab]);

  return (
    <section className="trend" aria-label="Trending on Squidlor">
      <div className="sec-head">
        <div>
          <span className="eyebrow">what is moving</span>
          <h2>Trending on Squidlor</h2>
        </div>
        <div className="sec-side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>
              Most traded
            </button>
            <button role="tab" aria-selected={tab === 'movers'} className={tab === 'movers' ? 'on' : ''} onClick={() => setTab('movers')}>
              Top movers
            </button>
          </div>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="empty">Nothing has launched here yet. The board below fills as soon as the first token goes out.</div>
      ) : (
        <>
          <div className="trend-grid">
            {ordered.map((r, i) => (
              <button key={r.token} className="trend-card reveal" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => nav(`/t/${r.token}`)} aria-label={`Open ${r.symbol}`}>
                <span className="trend-rank">{String(i + 1).padStart(2, '0')}</span>
                <TokenLogo symbol={r.symbol} address={r.token} />
                <span className="trend-name">
                  <b>${r.symbol}</b>
                  <span className="dim">/{r.stock}c</span>
                </span>
                <span className="trend-nums">
                  <span className="mono">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : <span className="faint">pre-trade</span>}</span>
                  {r.change24hPct !== undefined ? <span className={`pill ${r.change24hPct >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</span> : <span className="pill flat">–</span>}
                </span>
                <span className="trend-meta mono faint">
                  {r.volume24hUsd ? `${usd(r.volume24hUsd)} vol` : 'no trades yet'} · {usd(r.mcapUsd)} mcap{r.createdAt ? ` · ${ago(r.createdAt)} old` : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="board-foot">
            <span>Every row is a token launched on Squidlor and priced in its tokenized stock. Figures are DEX pool prints; a launch with no trades yet shows its on-chain opening price.</span>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Disabled with the Base-wide list above; kept so restoring it is one paste ───────────────────
 *
 * function TrendRow({ t, i, window }: { t: TrendingToken; i: number; window: TrendWindow }) {
 *   const chg = t.changePercent[window] ?? t.changePercent['24h'];
 *   // Above ~20x liquidity in a day, DEX volume is wash trading more often than demand.
 *   const washy = (t.turnover ?? 0) > 20;
 *   const href = `https://www.geckoterminal.com/base/pools/${t.pool}`;
 *   return (
 *     <a className="trend-card reveal" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} href={href} target="_blank" rel="noreferrer nofollow" title={t.poolName ?? t.symbol}>
 *       <span className="trend-rank">{String(i + 1).padStart(2, '0')}</span>
 *       <TokenLogo {...(t.imageUrl ? { src: t.imageUrl } : {})} symbol={t.symbol} address={t.address ?? t.pool} />
 *       <span className="trend-name">
 *         <b>
 *           {t.symbol}
 *           {washy ? <span className="warn-mark" title="Turned over more than 20x its liquidity in 24h: often wash trading"> ⚠</span> : null}
 *         </b>
 *         <span className="dim">{t.name && t.name !== t.symbol ? t.name : t.quoteSymbol ? `/${t.quoteSymbol}` : short(t.address)}</span>
 *       </span>
 *       <span className="trend-nums">
 *         <span className="mono">{t.priceUsd !== undefined ? usd(t.priceUsd, { compact: false }) : '–'}</span>
 *         {chg !== undefined ? <span className={`pill ${chg >= 0 ? 'up' : 'down'}`}>{pct(chg)}</span> : <span className="pill flat">–</span>}
 *       </span>
 *       <span className="trend-meta mono faint">
 *         {usd(t.volume24hUsd)} vol · {usd(t.liquidityUsd)} liq{t.dex ? ` · ${t.dex}` : ''}
 *         {t.poolCreatedAt ? ` · ${ago(t.poolCreatedAt)}` : ''}
 *       </span>
 *     </a>
 *   );
 * }
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
