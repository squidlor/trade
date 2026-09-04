import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { fetchStocks } from '../lib/api';
import { pct, usd } from '../lib/format';
import { StockLogo } from './TokenLogo';

/**
 * The home page's row of stock tiles: the thirteen tokenized stocks, price and 24h move, each a
 * door to its trade page. The list is the same one /stocks renders in full.
 */
export function StocksStrip() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['stocks'], queryFn: fetchStocks, refetchInterval: 60_000 });
  const rows = [...(q.data?.stocks ?? [])].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
  return (
    <section className="strip" aria-label="Tokenized stocks">
      <div className="sec-head">
        <div>
          <span className="eyebrow">buy the stock itself</span>
          <h2>Tokenized stocks on Base</h2>
        </div>
        <div className="sec-side">
          {q.data ? <span className={`session-pill ${q.data.session.session}`}><span className="dot" />{q.data.session.label}</span> : null}
          <Link className="btn btn-ghost btn-sm" to="/stocks">
            All 13 →
          </Link>
        </div>
      </div>
      {q.data?.degraded ? <div className="notice">{q.data.degraded}</div> : null}
      <div className="stock-tiles">
        {q.isPending
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="stock-tile skeleton" style={{ height: 96 }} />)
          : rows.map((r, i) => (
              <button key={r.symbol} className={`stock-tile reveal${r.pool ? '' : ' quiet'}`} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => nav(`/s/${r.symbol}`)} aria-label={`Buy ${r.tokenSymbol}`}>
                <div className="stock-tile-top">
                  <StockLogo {...(r.logo ? { src: r.logo } : {})} symbol={r.symbol} size={26} />
                  <span className="stock-tile-sym">{r.tokenSymbol}</span>
                  {r.change24hPct !== undefined ? <span className={`pill ${r.change24hPct >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</span> : <span className="pill flat">{r.thin ? 'thin' : r.pool ? '–' : 'soon'}</span>}
                </div>
                <div className="stock-tile-price mono">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : <span className="faint">no market yet</span>}</div>
                <div className="stock-tile-sub">
                  <span className="dim">{r.name}</span>
                  <span className="mono faint">{r.volume24hUsd ? `${usd(r.volume24hUsd)} 24h` : ''}</span>
                </div>
              </button>
            ))}
      </div>
    </section>
  );
}
