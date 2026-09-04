import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { TREND_WINDOWS, fetchTrending, type BoardRow, type TrendWindow, type TrendingToken } from '../lib/api';
import { ago, pct, short, usd } from '../lib/format';
import { TokenLogo } from './TokenLogo';

type Tab = 'movers' | 'base';

/**
 * What is moving. Two lists under one head: the Squidlor launches that moved most in 24h (from
 * the board rows already on the page, no extra request), and GeckoTerminal's trending pools on
 * Base folded to tokens. The second is read-only by design: these tokens are not ours, so the row
 * links out to the pool rather than pretending to a quote. Turnover above 20x liquidity is marked,
 * because on a DEX that pattern is wash volume far more often than demand.
 */
export function Trending({ rows }: { rows: BoardRow[] }) {
  const [tab, setTab] = useState<Tab>('base');
  const [window, setWindow] = useState<TrendWindow>('24h');
  const nav = useNavigate();
  const gt = useQuery({
    queryKey: ['trending', window],
    queryFn: () => fetchTrending(window, 'trending', 12),
    refetchInterval: 90_000,
    enabled: tab === 'base',
  });
  const movers = useMemo(
    () =>
      rows
        .filter((r) => r.change24hPct !== undefined && (r.volume24hUsd ?? 0) > 0)
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
        .slice(0, 12),
    [rows],
  );

  return (
    <section className="trend" aria-label="Trending">
      <div className="sec-head">
        <div>
          <span className="eyebrow">what is moving</span>
          <h2>Trending on Base</h2>
        </div>
        <div className="sec-side">
          {tab === 'base' ? (
            <div className="chips" style={{ margin: 0 }}>
              {TREND_WINDOWS.map((w) => (
                <button key={w} className={`chip${window === w ? ' on' : ''}`} onClick={() => setWindow(w)}>
                  {w}
                </button>
              ))}
            </div>
          ) : null}
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'base'} className={tab === 'base' ? 'on' : ''} onClick={() => setTab('base')}>
              All of Base
            </button>
            <button role="tab" aria-selected={tab === 'movers'} className={tab === 'movers' ? 'on' : ''} onClick={() => setTab('movers')}>
              Squidlor movers
            </button>
          </div>
        </div>
      </div>

      {tab === 'movers' ? (
        movers.length === 0 ? (
          <div className="empty">No Squidlor launch has a 24h move yet. The board below lists them all.</div>
        ) : (
          <div className="trend-grid">
            {movers.map((r, i) => (
              <button key={r.token} className="trend-card reveal" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => nav(`/t/${r.token}`)}>
                <span className="trend-rank">{String(i + 1).padStart(2, '0')}</span>
                <TokenLogo symbol={r.symbol} address={r.token} />
                <span className="trend-name">
                  <b>${r.symbol}</b>
                  <span className="dim">/{r.stock}c</span>
                </span>
                <span className="trend-nums">
                  <span className="mono">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : '–'}</span>
                  <span className={`pill ${(r.change24hPct ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</span>
                </span>
                <span className="trend-meta mono faint">
                  {usd(r.volume24hUsd)} vol · {usd(r.liquidityUsd)} liq
                </span>
              </button>
            ))}
          </div>
        )
      ) : gt.isPending ? (
        <div className="trend-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="trend-card skeleton" style={{ height: 76 }} />
          ))}
        </div>
      ) : gt.isError ? (
        <div className="notice err">{gt.error.message}</div>
      ) : (
        <>
          <div className="trend-grid">
            {gt.data.tokens.map((t, i) => (
              <TrendRow key={`${t.pool}-${i}`} t={t} i={i} window={window} />
            ))}
          </div>
          <div className="board-foot">
            <span>Ranked by GeckoTerminal's {window} trending score across Base DEX pools, deepest pool per token. Not oracle prices, not Squidlor launches.</span>
            <span>⚠ marks tokens that turned over more than 20x their liquidity in 24h.</span>
          </div>
        </>
      )}
    </section>
  );
}

function TrendRow({ t, i, window }: { t: TrendingToken; i: number; window: TrendWindow }) {
  const chg = t.changePercent[window] ?? t.changePercent['24h'];
  const washy = (t.turnover ?? 0) > 20;
  const href = `https://www.geckoterminal.com/base/pools/${t.pool}`;
  return (
    <a className="trend-card reveal" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} href={href} target="_blank" rel="noreferrer nofollow" title={t.poolName ?? t.symbol}>
      <span className="trend-rank">{String(i + 1).padStart(2, '0')}</span>
      <TokenLogo {...(t.imageUrl ? { src: t.imageUrl } : {})} symbol={t.symbol} address={t.address ?? t.pool} />
      <span className="trend-name">
        <b>
          {t.symbol}
          {washy ? (
            <span className="warn-mark" title="Turned over more than 20x its liquidity in 24h: often wash trading">
              {' '}
              ⚠
            </span>
          ) : null}
        </b>
        <span className="dim">{t.name && t.name !== t.symbol ? t.name : t.quoteSymbol ? `/${t.quoteSymbol}` : short(t.address)}</span>
      </span>
      <span className="trend-nums">
        <span className="mono">{t.priceUsd !== undefined ? usd(t.priceUsd, { compact: false }) : '–'}</span>
        {chg !== undefined ? <span className={`pill ${chg >= 0 ? 'up' : 'down'}`}>{pct(chg)}</span> : <span className="pill flat">–</span>}
      </span>
      <span className="trend-meta mono faint">
        {usd(t.volume24hUsd)} vol · {usd(t.liquidityUsd)} liq{t.dex ? ` · ${t.dex}` : ''}
        {t.poolCreatedAt ? ` · ${ago(t.poolCreatedAt)}` : ''}
      </span>
    </a>
  );
}
