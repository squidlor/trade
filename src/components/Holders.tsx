import { useQuery } from '@tanstack/react-query';
import { fetchHolders } from '../lib/api';
import { amount, short } from '../lib/format';
import { addressUrl } from '../lib/links';

/** Holder count, the share still in the pool, and the ten largest wallets, from the token's own Transfer events. */
export function HoldersCard({ tokenKey, symbol, enabled }: { tokenKey: string; symbol: string; enabled: boolean }) {
  const q = useQuery({ queryKey: ['holders', tokenKey], queryFn: () => fetchHolders(tokenKey), enabled, refetchInterval: 60_000 });
  if (!enabled) return null;
  const h = q.data;
  const max = h?.top[0]?.percent ?? 0;
  return (
    <section className="card" aria-label="Holders">
      <div className="card-head">
        <span className="card-title">Holders</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {h ? `${h.transfers} transfers · block ${h.asOfBlock}${h.catchingUp ? ' · catching up' : ''}` : ''}
        </span>
      </div>
      {q.isPending ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : q.isError ? (
        <div className="dim">{q.error.message}</div>
      ) : h ? (
        <>
          <div className="tiles" style={{ marginBottom: 14 }}>
            <div className="tile">
              <span className="eyebrow">wallets</span>
              <b>{h.count}</b>
              <small>holding ${symbol}</small>
            </div>
            <div className="tile">
              <span className="eyebrow">in the pool</span>
              <b>{h.inPoolPercent !== undefined ? `${h.inPoolPercent.toFixed(1)}%` : '–'}</b>
              <small>of supply, as liquidity</small>
            </div>
            <div className="tile">
              <span className="eyebrow">top holder</span>
              <b>{h.top[0] ? `${h.top[0].percent.toFixed(2)}%` : '–'}</b>
              <small>{h.top[0] ? (h.top[0].isCreator ? 'the creator' : short(h.top[0].address)) : 'nobody yet'}</small>
            </div>
          </div>
          {h.top.length ? (
            <ol className="holders">
              {h.top.map((t, i) => (
                <li key={t.address}>
                  <span className="mono faint">{String(i + 1).padStart(2, '0')}</span>
                  <a href={addressUrl(t.address)} target="_blank" rel="noreferrer" className="mono">
                    {short(t.address, 8, 6)}
                  </a>
                  {t.isCreator ? <span className="tag good">creator</span> : null}
                  <span className="holder-bar">
                    <span style={{ width: `${max > 0 ? Math.max(2, (t.percent / max) * 100) : 0}%` }} />
                  </span>
                  <span className="mono">{amount(t.balance)}</span>
                  <span className="mono dim">{t.percent.toFixed(2)}%</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty" style={{ padding: '16px 0 4px' }}>
              No wallet holds ${symbol} yet. The whole supply is in the pool.
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
