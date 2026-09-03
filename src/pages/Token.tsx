import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAccount } from 'wagmi';
import { EditProfile } from '../components/EditProfile';
import { HoldersCard } from '../components/Holders';
import { StockLogo, TokenLogo } from '../components/TokenLogo';
import { PredictionCard } from '../components/PredictionCard';
import { PriceChart } from '../components/PriceChart';
import { TradePanel } from '../components/TradePanel';
import { TradesFeed } from '../components/TradesFeed';
import { ApiError, fetchToken } from '../lib/api';
import { amount, dateTime, pct, short, tiny, usd } from '../lib/format';
import { addressUrl, askGeyser, tokenUrl, txUrl } from '../lib/links';

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

export function TokenPage() {
  const { key = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { address } = useAccount();
  const [editing, setEditing] = useState(false);
  const q = useQuery({
    queryKey: ['token', key, address ?? ''],
    queryFn: () => fetchToken(key, address),
    refetchInterval: 15_000,
    enabled: key.length > 0,
  });
  const o = q.data;

  useEffect(() => {
    document.title = o ? `$${o.token.symbol} / ${o.stock.tokenSymbol} · Squidlor Trade` : 'Squidlor Trade';
  }, [o]);
  const isCreator = !!(o?.launch.creator && address && o.launch.creator.toLowerCase() === address.toLowerCase());
  // `/t/<token>?edit=1` (the launch page sends creators here) opens the editor once the page knows who they are.
  useEffect(() => {
    if (params.get('edit') && isCreator) {
      setEditing(true);
      params.delete('edit');
      setParams(params, { replace: true });
    }
  }, [params, isCreator, setParams]);

  if (q.isPending) {
    return (
      <>
        <div className="crumbs">
          <Link to="/">Tokens</Link> / <span className="skeleton">loading…</span>
        </div>
        <div className="thead">
          <span className="avatar lg skeleton" />
          <h1 className="skeleton">Loading token</h1>
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
  if (q.isError || !o) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <span className="eyebrow">{status === 400 ? 'unknown token' : 'error'}</span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '10px 0' }}>{q.error?.message ?? 'Could not load this token.'}</h1>
        <p className="dim">Token pages take an address or a symbol of a stock-paired launch on Base.</p>
        <Link className="btn" to="/">
          Back to the board
        </Link>
      </div>
    );
  }

  const price = o.market?.priceUsd ?? o.spot?.priceUsd;
  const mcap = o.market?.mcapUsd ?? o.spot?.mcapUsd;
  const change = o.market?.change24hPct;
  const sym = o.token.symbol || short(o.token.address);
  const priceInStock = o.spot?.priceInStock ?? (price !== undefined && o.stock.priceUsd > 0 ? price / o.stock.priceUsd : undefined);

  return (
    <>
      <div className="crumbs">
        <Link to="/">Tokens</Link> / <span className="mono">${sym}</span>
      </div>

      <header className="thead">
        <TokenLogo src={o.token.logo} symbol={o.token.symbol} address={o.token.address} large />
        <div>
          <h1>
            {o.token.name || sym}
            <small>${sym}</small>
          </h1>
          <div className="thead-meta">
            <span className="pair">
              <StockLogo src={o.stock.logo} symbol={o.stock.symbol} size={14} /> paired with <b>{o.stock.tokenSymbol}</b> · {o.stock.name}
            </span>
            {o.launch.launchedHere ? <span className="tag good">launched on Squidlor</span> : <span className="tag warn">not launched on Squidlor</span>}
            {o.pool?.feePercent !== undefined ? <span className="tag">{o.pool.feePercent}% pool fee</span> : o.pool?.dynamicFee ? <span className="tag">dynamic fee</span> : null}
            <span className="addr">
              <a href={tokenUrl(o.token.address)} target="_blank" rel="noreferrer">
                {short(o.token.address, 8, 6)}
              </a>
              <Copy text={o.token.address} />
            </span>
            {isCreator ? (
              <button className="btn btn-ghost btn-sm edit-btn" onClick={() => setEditing(true)}>
                ✎ Edit page
              </button>
            ) : null}
          </div>
          {o.profile?.tagline ? <p className="tagline">{o.profile.tagline}</p> : null}
        </div>
        <div className="price-block">
          <div className="big">{price !== undefined ? usd(price, { compact: false }) : '–'}</div>
          <div className="sub">
            {change !== undefined ? <span className={change >= 0 ? 'up' : 'down'}>{pct(change)} 24h</span> : <span className="faint">no 24h print yet</span>}
            {priceInStock !== undefined ? (
              <span className="mono">
                {tiny(priceInStock)} {o.stock.tokenSymbol}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {o.candidates && o.candidates > 1 ? (
        <div className="notice info">
          {o.candidates} tokens share the ticker ${sym}. This is the one {o.pickedBy ?? 'chosen'}. The address above is what trades. Open another by
          its address if this is not it.
        </div>
      ) : null}

      <div className="grid">
        <div className="col">
          <PriceChart tokenKey={o.token.address} symbol={sym} {...(o.spot ? { spotUsd: o.spot.priceUsd } : {})} {...(mcap !== undefined ? { mcapUsd: mcap } : {})} />

          <div className="tiles">
            <div className="tile">
              <span className="eyebrow">Market cap</span>
              <b>{usd(mcap)}</b>
              <small>{o.token.totalSupply ? `${amount(o.token.totalSupply)} supply` : ''}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">Volume 24h</span>
              <b>{usd(o.market?.volume24hUsd)}</b>
              <small>{o.market ? `${o.market.buys24h ?? 0} buys · ${o.market.sells24h ?? 0} sells` : 'no trades indexed'}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">Liquidity</span>
              <b>{usd(o.market?.liquidityUsd)}</b>
              <small>{o.market?.dex || 'uniswap-v4-base'}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">{o.stock.tokenSymbol} price</span>
              <b>{usd(o.stock.priceUsd, { compact: false })}</b>
              <small>the money this token is priced in</small>
            </div>
            <div className="tile">
              <span className="eyebrow">1h</span>
              <b className={o.market?.change1hPct === undefined ? '' : o.market.change1hPct >= 0 ? 'up' : 'down'}>{pct(o.market?.change1hPct)}</b>
              <small>price change</small>
            </div>
          </div>

          {o.profile && (o.profile.description || o.profile.website || o.profile.x || o.profile.telegram) ? (
            <section className="card" aria-label="About">
              <div className="card-head">
                <span className="card-title">About ${sym}</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  by the creator
                </span>
              </div>
              <div className="about-hero">
                <div style={{ minWidth: 0 }}>
                  {o.profile.description ? <p>{o.profile.description}</p> : null}
                  <div className="about-links">
                    {o.profile.website ? (
                      <a href={o.profile.website} target="_blank" rel="noreferrer nofollow">
                        🌐 {o.profile.website.replace(/^https:\/\//, '').replace(/\/$/, '')}
                      </a>
                    ) : null}
                    {o.profile.x ? (
                      <a href={`https://x.com/${o.profile.x}`} target="_blank" rel="noreferrer nofollow">
                        𝕏 @{o.profile.x}
                      </a>
                    ) : null}
                    {o.profile.telegram ? (
                      <a href={`https://t.me/${o.profile.telegram}`} target="_blank" rel="noreferrer nofollow">
                        ✈ {o.profile.telegram}
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : isCreator ? (
            <section className="card" aria-label="About">
              <div className="about-hero">
                <div>
                  <div className="card-title">Tell people about ${sym}</div>
                  <p>Add an image, a line, a description and your links. Only your wallet can edit this page.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
                    Set up the page
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <HoldersCard tokenKey={o.token.address} symbol={sym} enabled={o.launch.launchedHere} />

          <TradesFeed tokenKey={o.token.address} symbol={sym} stockSymbol={o.stock.tokenSymbol} />

          <section className="card" aria-label="Details">
            <div className="card-head">
              <span className="card-title">About this launch</span>
              <a className="btn btn-ghost btn-sm" href={askGeyser(`Tell me about $${sym} (${o.token.address}), the token paired with ${o.stock.symbol}`)} target="_blank" rel="noreferrer">
                Ask the desk ↗
              </a>
            </div>
            <dl className="kv">
              <dt>Token</dt>
              <dd>
                <a href={tokenUrl(o.token.address)} target="_blank" rel="noreferrer">
                  {o.token.address}
                </a>
              </dd>
              <dt>Paired stock token</dt>
              <dd>
                <a href={tokenUrl(o.stock.address)} target="_blank" rel="noreferrer">
                  {o.stock.tokenSymbol} · {short(o.stock.address, 8, 6)}
                </a>
              </dd>
              {o.launch.creator ? (
                <>
                  <dt>Creator</dt>
                  <dd>
                    <a href={addressUrl(o.launch.creator)} target="_blank" rel="noreferrer">
                      {short(o.launch.creator, 8, 6)}
                    </a>
                  </dd>
                </>
              ) : null}
              <dt>Launched</dt>
              <dd>
                {o.launch.txHash ? (
                  <a href={txUrl(o.launch.txHash)} target="_blank" rel="noreferrer">
                    {dateTime(o.launch.createdAt)}
                  </a>
                ) : (
                  dateTime(o.launch.createdAt ?? o.market?.createdAt)
                )}
              </dd>
              {o.pool ? (
                <>
                  <dt>Uniswap v4 pool</dt>
                  <dd title={o.pool.id}>{short(o.pool.id, 10, 6)}</dd>
                  <dt>Hook</dt>
                  <dd>
                    <a href={addressUrl(o.pool.key.hooks)} target="_blank" rel="noreferrer">
                      Doppler · {short(o.pool.key.hooks, 8, 6)}
                    </a>
                  </dd>
                </>
              ) : null}
              <dt>Mechanics</dt>
              <dd style={{ fontFamily: 'var(--font-body)', maxWidth: 420, textAlign: 'right' }}>
                Whole supply seeded as one-sided liquidity, priced in {o.stock.tokenSymbol}. Not pegged: if {o.stock.symbol} rises 10% with no trades, the
                dollar price rises 10% too.
              </dd>
              <dt>Also on</dt>
              <dd>
                <a href={o.links.uniswap} target="_blank" rel="noreferrer">
                  Uniswap
                </a>{' '}
                ·{' '}
                <a href={o.links.basescan} target="_blank" rel="noreferrer">
                  Basescan
                </a>
              </dd>
            </dl>
          </section>
        </div>

        <div className="col">
          {editing ? <EditProfile overview={o} onClose={() => setEditing(false)} /> : null}
          <div className="sticky col">
            <TradePanel overview={o} />
            <PredictionCard stockSymbol={o.stock.symbol} stockName={o.stock.name} stockPriceUsd={o.stock.priceUsd} tokenSymbol={sym} />
          </div>
        </div>
      </div>
    </>
  );
}
