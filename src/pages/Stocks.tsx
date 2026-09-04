import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { StockLogo } from '../components/TokenLogo';
import { fetchStocks, type StockRow } from '../lib/api';
import { pct, usd } from '../lib/format';
import { SessionPill } from './Stock';

type Order = 'volume' | 'change' | 'name';

/** The thirteen tokenized stocks on Base, as a table. Every row opens its trade page. */
export function StocksPage() {
  const nav = useNavigate();
  const [order, setOrder] = useState<Order>('volume');
  const q = useQuery({ queryKey: ['stocks'], queryFn: fetchStocks, refetchInterval: 60_000 });
  useEffect(() => {
    document.title = 'Tokenized stocks on Base · Squidlor Trade';
  }, []);
  const rows = useMemo(() => {
    const all = q.data?.stocks ?? [];
    const sorted = [...all];
    if (order === 'volume') sorted.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0) || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    if (order === 'change') sorted.sort((a, b) => (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity));
    if (order === 'name') sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return sorted;
  }, [q.data, order]);
  const totals = useMemo(() => {
    const all = q.data?.stocks ?? [];
    return {
      vol: all.reduce((s, r) => s + (r.volume24hUsd ?? 0), 0),
      liq: all.reduce((s, r) => s + (r.liquidityUsd ?? 0), 0),
      trading: all.filter((r) => r.pool).length,
    };
  }, [q.data]);

  return (
    <>
      <section className="stocks-hero">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> Coinbase tokenized stocks · Base
          </span>
          <h1>
            Buy the stock <em>on Base</em>.
          </h1>
          <p>Thirteen US stocks, one token each, traded on Base with ETH or USDC.</p>
          {q.data ? <SessionPill {...q.data.session} /> : null}
        </div>
        <dl className="ledger">
          <div>
            <dt>trading</dt>
            <dd className={q.isPending ? 'skeleton' : ''}>
              {totals.trading}
              <span className="faint">/13</span>
            </dd>
          </div>
          <div>
            <dt>24h volume</dt>
            <dd className={q.isPending ? 'skeleton' : ''}>{usd(totals.vol)}</dd>
          </div>
          <div>
            <dt>liquidity</dt>
            <dd className={q.isPending ? 'skeleton' : ''}>{usd(totals.liq)}</dd>
          </div>
        </dl>
      </section>

      {q.data?.degraded ? <div className="notice">{q.data.degraded}</div> : null}
      {q.isError ? <div className="notice err">{q.error.message}</div> : null}

      <section className="board">
        <div className="board-head">
          <div>
            <span className="eyebrow">the stocks</span>
            <h2>Tokenized stocks</h2>
          </div>
          <div className="tabs" role="tablist">
            {(['volume', 'change', 'name'] as const).map((o) => (
              <button key={o} role="tab" aria-selected={order === o} className={order === o ? 'on' : ''} onClick={() => setOrder(o)}>
                {o === 'volume' ? 'Most traded' : o === 'change' ? 'Top movers' : 'A to Z'}
              </button>
            ))}
          </div>
        </div>
        <div className="board-table">
          <table className="table">
            <thead>
              <tr>
                <th>Stock</th>
                <th className="r">Price</th>
                <th className="r">24h</th>
                <th className="r hide-s">Reference</th>
                <th className="r hide-m">Volume 24h</th>
                <th className="r hide-m">Liquidity</th>
                <th className="hide-s">Venue</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isPending
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8}>
                        <div className="skeleton" style={{ height: 40 }}>
                          &nbsp;
                        </div>
                      </td>
                    </tr>
                  ))
                : rows.map((r, i) => <StockTableRow key={r.symbol} r={r} i={i} onOpen={() => nav(`/s/${r.symbol}`)} />)}
            </tbody>
          </table>
        </div>
        <div className="board-foot">
          <span>
            Want a token priced in one of these? <Link to="/launch">Launch it</Link>.
          </span>
        </div>
      </section>
    </>
  );
}

function StockTableRow({ r, i, onOpen }: { r: StockRow; i: number; onOpen: () => void }) {
  const chg = r.change24hPct;
  const drift = r.priceUsd !== undefined && r.referencePriceUsd ? ((r.priceUsd - r.referencePriceUsd) / r.referencePriceUsd) * 100 : undefined;
  return (
    <tr className="row" onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : undefined)} tabIndex={0} role="link" aria-label={`Open ${r.symbol}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
      <td>
        <div className="tok">
          <StockLogo {...(r.logo ? { src: r.logo } : {})} symbol={r.symbol} size={36} />
          <div className="tok-name">
            <b>{r.tokenSymbol}</b>
            <span>{r.name}</span>
          </div>
        </div>
      </td>
      <td className="r mono price-cell">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : <span className="faint">no market yet</span>}</td>
      <td className="r">{chg === undefined ? <span className="pill flat">{r.thin ? 'thin' : '–'}</span> : <span className={`pill ${chg >= 0 ? 'up' : 'down'}`}>{pct(chg)}</span>}</td>
      <td className="r mono hide-s">
        {r.referencePriceUsd !== undefined ? usd(r.referencePriceUsd, { compact: false }) : <span className="faint">–</span>}
        {drift !== undefined && Math.abs(drift) >= 1 ? <span className={`dim ${drift > 0 ? 'up' : 'down'}`} style={{ fontSize: 11, marginLeft: 6 }}>{pct(drift)}</span> : null}
      </td>
      <td className="r mono hide-m">{r.volume24hUsd ? usd(r.volume24hUsd) : <span className="faint">–</span>}</td>
      <td className="r mono hide-m">{r.liquidityUsd ? usd(r.liquidityUsd) : <span className="faint">–</span>}</td>
      <td className="hide-s">{r.pool ? <span className="tag">{r.pool.dex.replace(/-base$/, '')}</span> : <span className="tag warn">none</span>}</td>
      <td className="r arrow">→</td>
    </tr>
  );
}
