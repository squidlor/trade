import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../components/Avatar';
import { fetchBoard, type BoardRow, type BoardScope } from '../lib/api';
import { ago, pct, usd } from '../lib/format';
import { launchOnChat } from '../lib/links';

/** Coinbase's B20 stocks on Base, in the order the desk lists them. The chips; the API validates. */
const STOCKS = ['NVDA', 'TSLA', 'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'META', 'COIN', 'CRCL', 'INTC', 'MSTR', 'SNDK', 'SPCX'];

function Row({ r, i, maxVol, onOpen }: { r: BoardRow; i: number; maxVol: number; onOpen: () => void }) {
  const volPct = maxVol > 0 && r.volume24hUsd ? Math.max(2, (r.volume24hUsd / maxVol) * 100) : 0;
  return (
    <tr
      className="row"
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : undefined)}
      tabIndex={0}
      role="link"
      aria-label={`Open ${r.symbol}`}
    >
      <td className="mono faint hide-s">{i + 1}</td>
      <td>
        <div className="tok">
          <Avatar symbol={r.symbol} address={r.token} />
          <div className="tok-name">
            <b>
              ${r.symbol}
              {r.launchedHere ? (
                <>
                  {' '}
                  <span className="tag good">launched here</span>
                </>
              ) : null}
            </b>
            <span>{r.name && r.name !== r.symbol ? r.name : `${r.token.slice(0, 10)}…`}</span>
          </div>
        </div>
      </td>
      <td className="hide-s">
        <span className="pair">
          paired with <b>{r.stock}c</b>
        </span>
      </td>
      <td className="r mono">{usd(r.priceUsd, { compact: false })}</td>
      <td className={`r mono ${r.change24hPct === undefined ? 'faint' : r.change24hPct >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</td>
      <td className="r mono hide-s">{usd(r.mcapUsd)}</td>
      <td className="r hide-m" style={{ minWidth: 140 }}>
        <span className="mono">{r.volume24hUsd !== undefined ? usd(r.volume24hUsd) : <span className="faint">no trades yet</span>}</span>
        <div className="volbar">{volPct > 0 ? <span style={{ width: `${volPct}%` }} /> : null}</div>
      </td>
      <td className="r mono hide-m">{usd(r.liquidityUsd)}</td>
      <td className="r mono dim hide-s">{r.createdAt ? ago(r.createdAt) : '—'}</td>
    </tr>
  );
}

export function BoardPage() {
  const [scope, setScope] = useState<BoardScope>('active');
  const [stock, setStock] = useState<string | undefined>(undefined);
  const nav = useNavigate();
  useEffect(() => {
    document.title = 'Squidlor Trade — tokens paired with stocks, on Base';
  }, []);

  const q = useQuery({
    queryKey: ['board', scope, stock ?? 'all'],
    queryFn: () => fetchBoard(scope, stock, 30),
    refetchInterval: 60_000,
  });
  const rows = q.data?.rows ?? [];
  const stats = useMemo(() => {
    const vol = rows.reduce((s, r) => s + (r.volume24hUsd ?? 0), 0);
    const top = rows.filter((r) => r.change24hPct !== undefined).sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))[0];
    const stocks = new Set(rows.map((r) => r.stock)).size;
    return { vol, top, stocks };
  }, [rows]);
  const maxVol = Math.max(0, ...rows.map((r) => r.volume24hUsd ?? 0));

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Base · Uniswap v4 · Doppler</span>
          <h1>
            Trade tokens that are <em>priced in stocks</em>.
          </h1>
          <p>
            Every token here trades against a tokenized US stock instead of ETH: NVDAc, TSLAc, AAPLc and ten more. Buy with the stock, sell for the
            stock, and watch the chart move with both.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={launchOnChat(stock)} target="_blank" rel="noreferrer">
              Launch your own token ↗
            </a>
            <button className="btn btn-ghost" onClick={() => document.getElementById('board')?.scrollIntoView({ behavior: 'smooth' })}>
              Browse the board ↓
            </button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <span className="eyebrow">24h volume</span>
            <b className={q.isPending ? 'skeleton' : ''}>{usd(stats.vol)}</b>
            <small>across the {scope === 'active' ? 'most active' : 'newest'} {rows.length}</small>
          </div>
          <div className="stat">
            <span className="eyebrow">Top mover</span>
            <b className={q.isPending ? 'skeleton' : stats.top ? ((stats.top.change24hPct ?? 0) >= 0 ? 'up' : 'down') : ''}>
              {stats.top ? pct(stats.top.change24hPct) : '—'}
            </b>
            <small>{stats.top ? `$${stats.top.symbol} / ${stats.top.stock}c` : 'no prints yet'}</small>
          </div>
          <div className="stat">
            <span className="eyebrow">Stocks paired</span>
            <b className={q.isPending ? 'skeleton' : ''}>{stats.stocks || '—'}</b>
            <small>of 13 tokenized on Base</small>
          </div>
        </div>
      </section>

      <section id="board" className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="toolbar" style={{ padding: '14px 16px 0' }}>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={scope === 'active'} className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>
              Most active
            </button>
            <button role="tab" aria-selected={scope === 'new'} className={scope === 'new' ? 'on' : ''} onClick={() => setScope('new')}>
              Newest launches
            </button>
          </div>
          <div className="chips" role="group" aria-label="Filter by stock">
            <button className={`chip${stock === undefined ? ' on' : ''}`} onClick={() => setStock(undefined)}>
              all
            </button>
            {STOCKS.map((s) => (
              <button key={s} className={`chip${stock === s ? ' on' : ''}`} onClick={() => setStock(stock === s ? undefined : s)}>
                {s}c
              </button>
            ))}
          </div>
          <div className="toolbar-right">{q.data?.source ? 'DEX pool prints via GeckoTerminal' : ''}</div>
        </div>
        <div style={{ padding: '10px 16px 0' }}>
          {q.data?.degraded ? <div className="notice">{q.data.degraded}</div> : null}
          {q.isError ? <div className="notice err">{q.error.message}</div> : null}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th className="hide-s">#</th>
                <th>Token</th>
                <th className="hide-s">Pair</th>
                <th className="r">Price</th>
                <th className="r">24h</th>
                <th className="r hide-s">Market cap</th>
                <th className="r hide-m">Volume 24h</th>
                <th className="r hide-m">Liquidity</th>
                <th className="r hide-s">Age</th>
              </tr>
            </thead>
            <tbody>
              {q.isPending
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9}>
                        <div className="skeleton" style={{ height: 36 }}>
                          &nbsp;
                        </div>
                      </td>
                    </tr>
                  ))
                : rows.map((r, i) => <Row key={r.token} r={r} i={i} maxVol={maxVol} onOpen={() => nav(`/t/${r.token}`)} />)}
            </tbody>
          </table>
          {q.isSuccess && rows.length === 0 ? <div className="empty">Nothing here for that filter yet.</div> : null}
        </div>
        {q.data?.more ? (
          <div className="faint" style={{ padding: '10px 16px 14px', fontSize: 12 }}>
            {q.data.more} Open any token, or search by address at <span className="mono">/t/&lt;address&gt;</span>.
          </div>
        ) : null}
      </section>
    </>
  );
}
