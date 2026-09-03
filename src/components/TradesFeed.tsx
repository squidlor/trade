import { useQuery } from '@tanstack/react-query';
import { fetchTrades } from '../lib/api';
import { ago, amount, short, usd } from '../lib/format';
import { addressUrl, txUrl } from '../lib/links';

/** The pool's recent swaps, newest first, side relative to the token. Polls while the page is open. */
export function TradesFeed({ tokenKey, symbol, stockSymbol }: { tokenKey: string; symbol: string; stockSymbol: string }) {
  const q = useQuery({ queryKey: ['trades', tokenKey], queryFn: () => fetchTrades(tokenKey), refetchInterval: 20_000 });
  const trades = q.data?.trades ?? [];
  return (
    <section className="card feed" aria-label="Recent trades">
      <div className="card-head">
        <span className="card-title">Recent trades</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {trades.length ? `last ${trades.length}` : ''}
        </span>
      </div>
      {q.isPending ? (
        <div className="empty dim">loading…</div>
      ) : q.isError ? (
        <div className="empty dim">{q.error.message}</div>
      ) : trades.length === 0 ? (
        <div className="empty">No swaps indexed yet. Be the first.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Side</th>
                <th className="r">${symbol}</th>
                <th className="r">{stockSymbol}</th>
                <th className="r hide-s">Price</th>
                <th className="r">Value</th>
                <th className="r hide-m">Wallet</th>
                <th className="r">When</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 30).map((t) => (
                <tr key={`${t.txHash}-${t.t}`}>
                  <td className={t.side === 'buy' ? 'side-buy' : 'side-sell'}>{t.side}</td>
                  <td className="r mono">{amount(t.tokenAmount)}</td>
                  <td className="r mono">{amount(t.stockAmount, 6)}</td>
                  <td className="r mono hide-s">{usd(t.priceUsd, { compact: false })}</td>
                  <td className="r mono">{usd(t.volumeUsd)}</td>
                  <td className="r mono hide-m">
                    <a href={addressUrl(t.wallet)} target="_blank" rel="noreferrer">
                      {short(t.wallet)}
                    </a>
                  </td>
                  <td className="r mono">
                    <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer" className="dim">
                      {ago(t.t)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
