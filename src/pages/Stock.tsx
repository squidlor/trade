import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAccount } from 'wagmi';
import { PredictionCard } from '../components/PredictionCard';
import { PriceChart } from '../components/PriceChart';
import { StockTradePanel } from '../components/StockTradePanel';
import { StockLogo, TokenLogo } from '../components/TokenLogo';
import { ApiError, fetchBoard, fetchStock, fetchStockCandles, type Interval } from '../lib/api';
import { ago, amount, pct, short, usd } from '../lib/format';
import { tokenUrl } from '../lib/links';

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
      aria-label="Copy address"
      title="Copy"
    >
      {ok ? '✓' : '⧉'}
    </button>
  );
}

/** Where the US session is, as a pill. The token trades on Base regardless; this explains drift from the last print. */
export function SessionPill({ session, label }: { session: 'regular' | 'pre' | 'after' | 'closed'; label: string }) {
  return (
    <span className={`session-pill ${session}`} title="US equity session, New York time. The token itself trades on Base around the clock.">
      <span className="dot" />
      {label}
    </span>
  );
}

/** One tokenized stock: price, chart, the swap panel, and the tokens launched against it. */
export function StockPage() {
  const { symbol = '' } = useParams();
  const { address } = useAccount();
  const nav = useNavigate();
  const key = symbol.toUpperCase();
  const q = useQuery({
    queryKey: ['stock', key, address ?? ''],
    queryFn: () => fetchStock(key, address),
    refetchInterval: 20_000,
    enabled: key.length > 0,
  });
  const launches = useQuery({
    queryKey: ['board', 'squidlor', key, 'stockpage'],
    queryFn: () => fetchBoard('squidlor', key, 8),
    staleTime: 60_000,
    enabled: key.length > 0,
  });
  const o = q.data;
  const s = o?.stock;
  useEffect(() => {
    document.title = s ? `${s.tokenSymbol} · ${s.name} on Base · Squidlor Trade` : 'Squidlor Trade';
  }, [s]);
  const loadCandles = useCallback((interval: Interval) => fetchStockCandles(key, interval), [key]);

  if (q.isPending) {
    return (
      <>
        <div className="crumbs">
          <Link to="/stocks">Stocks</Link> / <span className="skeleton">loading…</span>
        </div>
        <div className="thead">
          <span className="avatar lg skeleton" />
          <h1 className="skeleton">Loading stock</h1>
        </div>
        <div className="grid">
          <div className="col">
            <div className="card skeleton" style={{ height: 440 }} />
            <div className="card skeleton" style={{ height: 120 }} />
          </div>
          <div className="col">
            <div className="card skeleton" style={{ height: 420 }} />
          </div>
        </div>
      </>
    );
  }
  if (q.isError || !o || !s) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <span className="eyebrow">{status === 400 ? 'unknown stock' : 'error'}</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '10px 0' }}>{q.error?.message ?? 'Could not load this stock.'}</h1>
        <p className="dim">Stock pages take one of the thirteen tokenized US stocks on Base, by ticker: /s/NVDA.</p>
        <Link className="btn" to="/stocks">
          All stocks
        </Link>
      </div>
    );
  }

  const price = s.priceUsd;
  const ref = s.referencePriceUsd;
  const drift = price !== undefined && ref !== undefined && ref > 0 ? ((price - ref) / ref) * 100 : undefined;
  const rows = launches.data?.rows ?? [];

  return (
    <>
      <div className="crumbs">
        <Link to="/stocks">Stocks</Link> / <span className="mono">{s.tokenSymbol}</span>
      </div>

      <header className="thead">
        <StockLogo {...(s.logo ? { src: s.logo } : {})} symbol={s.symbol} size={56} />
        <div>
          <h1>
            {s.name}
            <small>{s.tokenSymbol}</small>
          </h1>
          <div className="thead-meta">
            <span className="tag good">Coinbase tokenized stock · 1:1 backed</span>
            <SessionPill {...o.session} />
            {s.thin ? <span className="tag warn">thin market</span> : null}
            {s.pool ? <span className="tag">{s.pool.dex.replace(/-base$/, '')}</span> : <span className="tag warn">no DEX market yet</span>}
            <span className="addr">
              <a href={tokenUrl(s.address)} target="_blank" rel="noreferrer">
                {short(s.address, 8, 6)}
              </a>
              <Copy text={s.address} />
            </span>
          </div>
        </div>
        <div className="price-block">
          <div className="big">{price !== undefined ? usd(price, { compact: false }) : '–'}</div>
          <div className="sub">
            {s.change24hPct !== undefined ? <span className={s.change24hPct >= 0 ? 'up' : 'down'}>{pct(s.change24hPct)} 24h</span> : <span className="faint">{s.thin ? 'thin pool, no 24h figure' : 'no 24h print'}</span>}
            {ref !== undefined ? (
              <span className="mono" title="Chainlink's B20 feed for this stock: the underlying share price times the token multiplier, holding the last print outside US hours.">
                ref {usd(ref, { compact: false })}
                {drift !== undefined ? <span className={Math.abs(drift) < 1 ? 'faint' : drift > 0 ? 'up' : 'down'}> ({pct(drift)})</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="notice info">{o.eligibility}</div>

      <div className="grid">
        <div className="col">
          <PriceChart tokenKey={`stock:${key}`} symbol={s.tokenSymbol} load={loadCandles} {...(price !== undefined ? { spotUsd: price } : {})} {...(s.mcapUsd !== undefined ? { mcapUsd: s.mcapUsd } : {})} />

          <div className="tiles">
            <div className="tile">
              <span className="eyebrow">On-chain market cap</span>
              <b>{usd(s.mcapUsd)}</b>
              <small>tokens minted on Base</small>
            </div>
            <div className="tile">
              <span className="eyebrow">Volume 24h</span>
              <b>{usd(s.volume24hUsd)}</b>
              <small>all Base DEX pools</small>
            </div>
            <div className="tile">
              <span className="eyebrow">Liquidity</span>
              <b>{usd(s.liquidityUsd)}</b>
              <small>{s.pool ? `deepest: ${usd(s.pool.liquidityUsd)} on ${s.pool.dex.replace(/-base$/, '')}` : 'no pool indexed'}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">Reference price</span>
              <b>{ref !== undefined ? usd(ref, { compact: false }) : '–'}</b>
              <small>{s.referenceUpdatedAt ? `Chainlink · ${ago(s.referenceUpdatedAt)} ago` : s.hasFeed ? 'Chainlink B20 feed' : 'no Chainlink feed yet'}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">1h</span>
              <b className={s.change1hPct === undefined ? '' : s.change1hPct >= 0 ? 'up' : 'down'}>{pct(s.change1hPct)}</b>
              <small>price change</small>
            </div>
          </div>

          <section className="card" aria-label={`Tokens paired with ${s.symbol}`}>
            <div className="card-head">
              <span className="card-title">Launched against {s.tokenSymbol}</span>
              <Link className="btn btn-primary btn-sm" to={`/launch?stock=${s.symbol}`}>
                Launch a {s.symbol}-paired token
              </Link>
            </div>
            {launches.isPending ? (
              <div className="skeleton" style={{ height: 80 }}>
                &nbsp;
              </div>
            ) : rows.length === 0 ? (
              <p className="dim" style={{ margin: 0, fontSize: 13.5 }}>
                No Squidlor launch is priced in {s.tokenSymbol} yet. The first one sets the pace: its whole supply goes into a Uniswap v4 pool quoted in {s.tokenSymbol}, and every trade pays the creator.
              </p>
            ) : (
              <div className="paired-list">
                {rows.map((r) => (
                  <button key={r.token} className="paired-row" onClick={() => nav(`/t/${r.token}`)}>
                    <TokenLogo symbol={r.symbol} address={r.token} />
                    <span className="paired-name">
                      <b>${r.symbol}</b>
                      <span className="dim">{r.name && r.name !== r.symbol ? r.name : short(r.token, 8, 4)}</span>
                    </span>
                    <span className="mono">{r.priceUsd !== undefined ? usd(r.priceUsd, { compact: false }) : <span className="faint">pre-trade</span>}</span>
                    <span className={`pill ${r.change24hPct === undefined ? 'flat' : r.change24hPct >= 0 ? 'up' : 'down'}`}>{pct(r.change24hPct)}</span>
                    <span className="mono dim hide-s">{usd(r.mcapUsd)} mcap</span>
                    <span className="arrow">→</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-label="Details">
            <div className="card-head">
              <span className="card-title">About {s.tokenSymbol}</span>
            </div>
            <dl className="kv">
              <dt>Token</dt>
              <dd>
                <a href={tokenUrl(s.address)} target="_blank" rel="noreferrer">
                  {s.address}
                </a>
              </dd>
              <dt>Standard</dt>
              <dd>B20 · 8 decimals · Base (8453)</dd>
              <dt>Backing</dt>
              <dd style={{ fontFamily: 'var(--font-body)', maxWidth: 440, textAlign: 'right' }}>
                One token is one share of {s.name}, held by Coinbase's tokenization entity. Minting and redemption are for authorized participants; secondary trading on Base is open, subject to the
                token's transfer policy.
              </dd>
              {s.pool ? (
                <>
                  <dt>Deepest pool</dt>
                  <dd title={s.pool.id}>
                    {s.pool.name} · {s.pool.dex.replace(/-base$/, '')}
                  </dd>
                </>
              ) : null}
              <dt>Supply on Base</dt>
              <dd>{s.mcapUsd !== undefined && price ? `${amount(s.mcapUsd / price)} ${s.tokenSymbol}` : '–'}</dd>
              <dt>Hours</dt>
              <dd style={{ fontFamily: 'var(--font-body)', maxWidth: 440, textAlign: 'right' }}>
                Trades on Base 24/7. Outside the US session the on-chain price is set by Base traders alone and can drift from the last NYSE print; the reference price above holds that print.
              </dd>
              <dt>Also on</dt>
              <dd>
                <a href={s.links.uniswap} target="_blank" rel="noreferrer">
                  Uniswap
                </a>{' '}
                ·{' '}
                <a href={s.links.basescan} target="_blank" rel="noreferrer">
                  Basescan
                </a>
              </dd>
            </dl>
          </section>
        </div>

        <div className="col">
          <div className="sticky col">
            <StockTradePanel overview={o} />
            {s.hasFeed ? <PredictionCard stockSymbol={s.symbol} stockName={s.name} stockPriceUsd={price ?? ref ?? 0} tokenSymbol={s.tokenSymbol} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}
