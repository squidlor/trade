import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { StocksStrip } from '../components/StocksStrip';
import { StockLogo, TokenLogo } from '../components/TokenLogo';
import { Trending } from '../components/Trending';
import { fetchBoard, fetchLaunchConfig, fetchToken, type BoardRow } from '../lib/api';

type Row = BoardRow & { logo?: string; stockLogo?: string };
import { ago, pct, usd } from '../lib/format';
import { MARKETS_URL } from '../lib/links';

/** Coinbase's B20 stocks on Base, in the order the desk lists them. The chips; the API validates. */
const STOCKS = ['NVDA', 'TSLA', 'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'META', 'COIN', 'CRCL', 'INTC', 'MSTR', 'SNDK', 'SPCX'];

/**
 * The bonding curve, drawn. A Squidlor launch seeds three market-cap ranges (1x to 10x, 10x to
 * 100x, 100x and up) as one-sided liquidity, so the price path is a staircase of steepening
 * slopes, not a line. This is that shape, animated once on load. Decorative, but true.
 */
function Curve() {
  return (
    <svg className="curve" viewBox="0 0 520 260" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7b4dff" stopOpacity="0.15" />
          <stop offset="0.6" stopColor="#9972f8" />
          <stop offset="1" stopColor="#b98cff" />
        </linearGradient>
        <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7b4dff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7b4dff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 80, 120, 160, 200].map((y) => (
        <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="rgba(185,140,255,0.08)" strokeDasharray="2 6" />
      ))}
      <path className="curve-fill" d="M0 236 C 120 232, 200 222, 260 196 C 320 170, 360 120, 400 84 C 430 58, 470 34, 520 18 L520 260 L0 260 Z" fill="url(#cf)" />
      <path className="curve-line" d="M0 236 C 120 232, 200 222, 260 196 C 320 170, 360 120, 400 84 C 430 58, 470 34, 520 18" stroke="url(#cg)" strokeWidth="2.5" strokeLinecap="round" />
      <g className="curve-marks" fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="#5c5468">
        <text x="6" y="228">$4k</text>
        <text x="256" y="186">10x</text>
        <text x="392" y="74">100x</text>
      </g>
      <circle className="curve-dot" cx="260" cy="196" r="4" fill="#b98cff" />
    </svg>
  );
}

/** The newest Squidlor launch, as a ticket. Real data; nothing on it is a placeholder. */
function FeaturedTicket({ row, pending, pinned }: { row?: Row; pending: boolean; pinned?: boolean }) {
  const nav = useNavigate();
  if (pending || !row) {
    return (
      <div className="ticket ticket-empty">
        <Curve />
        <div className="ticket-body">
          <span className="eyebrow">featured launch</span>
          <div className="ticket-title skeleton">Loading the newest launch</div>
        </div>
      </div>
    );
  }
  const price = row.priceUsd;
  return (
    <div className="ticket" onClick={() => nav(`/t/${row.token}`)} role="link" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' ? nav(`/t/${row.token}`) : undefined)}>
      <Curve />
      <div className="ticket-body">
        <div className="ticket-top">
          <span className="eyebrow">
            <span className="live-dot" /> {pinned ? 'featured launch' : 'newest launch'} · {row.createdAt ? `${ago(row.createdAt)} ago` : 'on Base'}
          </span>
          <span className="ticket-chain">Base · 8453</span>
        </div>
        <div className="ticket-id">
          <TokenLogo src={row.logo} symbol={row.symbol} address={row.token} large />
          <div>
            <div className="ticket-title">{row.name && row.name !== row.symbol ? row.name : `$${row.symbol}`}</div>
            <div className="ticket-pair">
              <span className="pair-chip token">${row.symbol}</span>
              <span className="pair-arrow">⇄</span>
              <span className="pair-chip stock">
                <StockLogo src={row.stockLogo} symbol={row.stock} size={14} />
                {row.stock}c
              </span>
              <span className="dim">priced in tokenized {row.stock}</span>
            </div>
          </div>
        </div>
        <div className="ticket-nums">
          <div>
            <span className="eyebrow">price</span>
            <b>{price !== undefined ? usd(price, { compact: false }) : 'pre-trade'}</b>
          </div>
          <div>
            <span className="eyebrow">market cap</span>
            <b>{usd(row.mcapUsd)}</b>
          </div>
          <div>
            <span className="eyebrow">24h</span>
            <b className={row.change24hPct === undefined ? 'faint' : row.change24hPct >= 0 ? 'up' : 'down'}>{pct(row.change24hPct)}</b>
          </div>
        </div>
        <div className="ticket-actions">
          <Link className="btn btn-primary" to={`/t/${row.token}`} onClick={(e) => e.stopPropagation()}>
            Trade ${row.symbol}
          </Link>
          <Link className="btn btn-ghost" to={`/launch?stock=${row.stock}`} onClick={(e) => e.stopPropagation()}>
            Launch yours
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A looping tape of every Squidlor launch. Duplicated once so the loop has no seam. */
function Tape({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  const items = rows.length < 6 ? [...rows, ...rows, ...rows] : rows;
  const seq = [...items, ...items];
  return (
    <div className="tape" aria-hidden="true">
      <div className="tape-track" style={{ animationDuration: `${Math.max(30, seq.length * 3)}s` }}>
        {seq.map((r, i) => (
          <span key={`${r.token}-${i}`} className="tape-item">
            <b>${r.symbol}</b>
            <span className="dim">/{r.stock}c</span>
            <span className="mono">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : usd(r.mcapUsd)}</span>
            {r.change24hPct !== undefined ? <span className={`mono ${r.change24hPct >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</span> : null}
            <span className="tape-sep">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({ r, i, maxVol, onOpen }: { r: Row; i: number; maxVol: number; onOpen: () => void }) {
  const volPct = maxVol > 0 && r.volume24hUsd ? Math.max(3, (r.volume24hUsd / maxVol) * 100) : 0;
  const chg = r.change24hPct;
  return (
    <tr className="row" onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : undefined)} tabIndex={0} role="link" aria-label={`Open ${r.symbol}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
      <td className="mono faint hide-s idx">{String(i + 1).padStart(2, '0')}</td>
      <td>
        <div className="tok">
          <TokenLogo src={r.logo} symbol={r.symbol} address={r.token} />
          <div className="tok-name">
            <b>${r.symbol}</b>
            <span>{r.name && r.name !== r.symbol ? r.name : `${r.token.slice(0, 10)}…`}</span>
          </div>
        </div>
      </td>
      <td className="hide-s">
        <span className="pair-chip stock">
          <StockLogo src={r.stockLogo} symbol={r.stock} size={14} />
          {r.stock}c
        </span>
      </td>
      <td className="r mono price-cell">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : <span className="faint">pre-trade</span>}</td>
      <td className="r">
        {chg === undefined ? (
          <span className="pill flat">–</span>
        ) : (
          <span className={`pill ${chg >= 0 ? 'up' : 'down'}`}>{pct(chg)}</span>
        )}
      </td>
      <td className="r mono hide-s">{usd(r.mcapUsd)}</td>
      <td className="r hide-m vol-cell">
        <span className="mono">{r.volume24hUsd !== undefined ? usd(r.volume24hUsd) : <span className="faint">no trades yet</span>}</span>
        <div className="volbar">{volPct > 0 ? <span style={{ width: `${volPct}%` }} /> : null}</div>
      </td>
      <td className="r mono hide-m">{usd(r.liquidityUsd)}</td>
      <td className="r mono dim hide-s">{r.createdAt ? ago(r.createdAt) : '–'}</td>
      <td className="r arrow">→</td>
    </tr>
  );
}

export function BoardPage() {
  /** Both tabs are the same Squidlor-only list, ordered differently. */
  const [order, setOrder] = useState<'active' | 'new'>('active');
  const [stock, setStock] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const cfg = useQuery({ queryKey: ['launch-config'], queryFn: fetchLaunchConfig, staleTime: 5 * 60_000 });
  /** A launch that appears after the first load gets a toast; the first load itself does not. */
  const seen = useRef<Set<string> | null>(null);
  const [toast, setToast] = useState<Row | undefined>(undefined);
  const nav = useNavigate();
  useEffect(() => {
    document.title = 'Squidlor Trade: tokens paired with stocks on Base';
  }, []);

  const q = useQuery({
    queryKey: ['board', 'squidlor', stock ?? 'all'],
    queryFn: () => fetchBoard('squidlor', stock, 50),
    refetchInterval: 60_000,
  });
  /**
   * A launch nobody has traded yet has no DEX print, so the board row arrives without a price. The
   * token's own page reads the pool's on-chain price; the same read fills the gap here for the few
   * rows that need it, so a fresh launch shows its opening market cap instead of a dash.
   */
  // Overviews also carry the token and stock images, so every row gets one (capped so a long board
  // does not fan out into dozens of requests; the rest keep their monograms).
  const bare = (q.data?.rows ?? []).slice(0, 12);
  const spots = useQueries({
    queries: bare.map((r) => ({ queryKey: ['token', r.token, ''], queryFn: () => fetchToken(r.token), staleTime: 60_000 })),
  });
  // A string key rather than a spread: the number of queries changes with the data, and a
  // dependency array of changing length is exactly what React warns about.
  const spotKey = spots.map((s) => (s.data ? `${s.data.spot?.priceUsd ?? ''}:${s.data.token.logo ?? ''}` : '')).join('|');
  const all: Row[] = useMemo(() => {
    const base = q.data?.rows ?? [];
    const byToken = new Map(bare.map((r, i) => [r.token, spots[i]?.data]));
    return base.map((r): Row => {
      const o = byToken.get(r.token);
      if (!o) return r;
      const spot = o.spot;
      return {
        ...r,
        ...(o.token.logo ? { logo: o.token.logo } : {}),
        ...(o.stock.logo ? { stockLogo: o.stock.logo } : {}),
        ...(spot && r.priceUsd === undefined ? { priceUsd: spot.priceUsd, ...(spot.mcapUsd !== undefined ? { mcapUsd: spot.mcapUsd } : {}) } : {}),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, spotKey]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle ? all.filter((r) => r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || r.token.toLowerCase().startsWith(needle)) : all;
    return order === 'active'
      ? [...filtered].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0) || (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0))
      : [...filtered].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [all, order, search]);
  const newest = useMemo(() => [...all].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0], [all]);
  const pinnedAddr = cfg.data?.featured?.toLowerCase();
  const featured = useMemo(() => (pinnedAddr ? all.find((r) => r.token.toLowerCase() === pinnedAddr) : undefined) ?? newest, [all, pinnedAddr, newest]);
  useEffect(() => {
    if (!q.data) return;
    const now = new Set(q.data.rows.map((r) => r.token));
    if (seen.current) {
      const fresh = q.data.rows.filter((r) => !seen.current!.has(r.token)).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
      if (fresh) {
        setToast(fresh);
        const t = setTimeout(() => setToast(undefined), 12_000);
        seen.current = now;
        return () => clearTimeout(t);
      }
    }
    seen.current = now;
    return undefined;
  }, [q.data]);
  const stats = useMemo(() => {
    const vol = all.reduce((s, r) => s + (r.volume24hUsd ?? 0), 0);
    const mcap = all.reduce((s, r) => s + (r.mcapUsd ?? 0), 0);
    const stocks = new Set(all.map((r) => r.stock)).size;
    return { vol, mcap, stocks };
  }, [all]);
  const maxVol = Math.max(0, ...rows.map((r) => r.volume24hUsd ?? 0));

  return (
    <>
      <section className="hero">
        <div className="hero-orb" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <span className="eyebrow reveal" style={{ animationDelay: '0ms' }}>
            <span className="live-dot" /> Squidlor launchpad · live on Base
          </span>
          <h1 className="reveal" style={{ animationDelay: '80ms' }}>
            Tokens that trade
            <br />
            <em>in stocks</em>, not ETH.
          </h1>
          <p className="reveal" style={{ animationDelay: '160ms' }}>
            Every token here was launched on Squidlor against a tokenized US stock. Pay in NVDAc, TSLAc or AAPLc, hold a ticker that moves with the
            company, and sell back into the stock whenever you like.
          </p>
          <div className="hero-actions reveal" style={{ animationDelay: '240ms' }}>
            <Link className="btn btn-primary btn-lg" to={stock ? `/launch?stock=${stock}` : '/launch'}>
              Launch a token
            </Link>
            <button className="btn btn-ghost btn-lg" onClick={() => document.getElementById('board')?.scrollIntoView({ behavior: 'smooth' })}>
              See what is trading ↓
            </button>
          </div>
          <dl className="ledger reveal" style={{ animationDelay: '320ms' }}>
            <div>
              <dt>launches</dt>
              <dd className={q.isPending ? 'skeleton' : ''}>{all.length}</dd>
            </div>
            <div>
              <dt>24h volume</dt>
              <dd className={q.isPending ? 'skeleton' : ''}>{usd(stats.vol)}</dd>
            </div>
            <div>
              <dt>market cap</dt>
              <dd className={q.isPending ? 'skeleton' : ''}>{usd(stats.mcap)}</dd>
            </div>
            <div>
              <dt>stocks paired</dt>
              <dd className={q.isPending ? 'skeleton' : ''}>
                {stats.stocks}
                <span className="faint">/13</span>
              </dd>
            </div>
          </dl>
        </div>
        <div className="hero-side reveal" style={{ animationDelay: '200ms' }}>
          <FeaturedTicket {...(featured ? { row: featured } : {})} pending={q.isPending} pinned={!!pinnedAddr && featured?.token.toLowerCase() === pinnedAddr} />
        </div>
      </section>

      <Tape rows={all} />

      <StocksStrip />

      <Trending rows={all} />

      <section className="steps reveal" style={{ animationDelay: '380ms' }} aria-label="How it works">
        <Link className="step" to="/launch">
          <span className="step-n">01</span>
          <b>Launch</b>
          <span>Name a token, pick a stock, set the opening market cap. Two signatures, and the creator is paid a share of every trade forever.</span>
        </Link>
        <Link className="step" to="/stocks">
          <span className="step-n">02</span>
          <b>Trade</b>
          <span>Buy the stock token itself with ETH or USDC, then buy launches with it and sell back. Quotes are the real swap simulated on the current block.</span>
        </Link>
        <a className="step" href={MARKETS_URL} target="_blank" rel="noreferrer">
          <span className="step-n">03</span>
          <b>Predict</b>
          <span>Open a prediction market on the stock your token is priced in and let holders take a side.</span>
        </a>
      </section>

      {toast ? (
        <div className="toast reveal" role="status">
          <span className="live-dot" />
          New launch: <b>${toast.symbol}</b> paired with {toast.stock}c
          <Link to={`/t/${toast.token}`} className="btn btn-sm btn-primary">
            Open
          </Link>
          <button className="toast-x" onClick={() => setToast(undefined)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}

      <section id="board" className="board">
        <div className="board-head">
          <div>
            <span className="eyebrow">the board</span>
            <h2>Launched on Squidlor</h2>
          </div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={order === 'active'} className={order === 'active' ? 'on' : ''} onClick={() => setOrder('active')}>
              Most active
            </button>
            <button role="tab" aria-selected={order === 'new'} className={order === 'new' ? 'on' : ''} onClick={() => setOrder('new')}>
              Newest
            </button>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Filter by stock">
          <input className="search" type="search" placeholder="Search name, ticker or address" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tokens" />
          <button className={`chip${stock === undefined ? ' on' : ''}`} onClick={() => setStock(undefined)}>
            all stocks
          </button>
          {STOCKS.map((s) => (
            <button key={s} className={`chip${stock === s ? ' on' : ''}`} onClick={() => setStock(stock === s ? undefined : s)}>
              {s}c
            </button>
          ))}
        </div>
        {q.data?.degraded ? <div className="notice">{q.data.degraded}</div> : null}
        {q.isError ? <div className="notice err">{q.error.message}</div> : null}
        <div className="board-table">
          <table className="table">
            <thead>
              <tr>
                <th className="hide-s">#</th>
                <th>Token</th>
                <th className="hide-s">Paired with</th>
                <th className="r">Price</th>
                <th className="r">24h</th>
                <th className="r hide-s">Market cap</th>
                <th className="r hide-m">Volume 24h</th>
                <th className="r hide-m">Liquidity</th>
                <th className="r hide-s">Age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isPending
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10}>
                        <div className="skeleton" style={{ height: 40 }}>
                          &nbsp;
                        </div>
                      </td>
                    </tr>
                  ))
                : rows.map((r, i) => <Row key={r.token} r={r} i={i} maxVol={maxVol} onOpen={() => nav(`/t/${r.token}`)} />)}
            </tbody>
          </table>
          {q.isSuccess && rows.length === 0 && search.trim() ? (
            <div className="empty">No launch matches "{search.trim()}".</div>
          ) : q.isSuccess && rows.length === 0 ? (
            <div className="empty">
              No Squidlor launch paired with {stock ? `${stock}c` : 'a stock'} yet. <Link to={stock ? `/launch?stock=${stock}` : '/launch'}>Be the first</Link>.
            </div>
          ) : null}
        </div>
        <div className="board-foot">
          <span>Prices and volume are DEX pool prints via GeckoTerminal; a launch with no trades shows its on-chain opening price on its page.</span>
          {q.data?.more ? <span>{q.data.more}</span> : null}
          <span>
            Any address works at <span className="mono">/t/&lt;address&gt;</span>
          </span>
        </div>
      </section>
    </>
  );
}


