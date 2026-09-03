import { browseMarkets, createMarket } from '../lib/links';
import { usd } from '../lib/format';

/**
 * The bridge to the prediction market. A market needs an oracle to settle, and Squidlor's feeds
 * price the STOCK, not a token launched an hour ago — so the card offers a market on the stock the
 * token trades against, which is also the thing every holder of the token is implicitly betting on.
 * The example strike is a round number a little above spot, so the question reads as a real one.
 */
export function PredictionCard({ stockSymbol, stockName, stockPriceUsd, tokenSymbol }: { stockSymbol: string; stockName: string; stockPriceUsd: number; tokenSymbol: string }) {
  const strike = stockPriceUsd > 0 ? roundStrike(stockPriceUsd * 1.03) : undefined;
  return (
    <section className="card predict" aria-label="Launch a prediction market">
      <span className="eyebrow">Prediction markets</span>
      <h3>Want to launch predictions on it?</h3>
      <p>
        ${tokenSymbol} moves with {stockName}. Open a market on {stockSymbol}'s price and share it with your holders: a yes/no question, settled by
        Squidlor's oracle, tradable in minutes.
      </p>
      <div className="predict-q">
        Will <span>{stockSymbol}</span> be above <span>{strike !== undefined ? usd(strike, { compact: false }) : '$…'}</span> at Friday's close?
      </div>
      <div className="predict-actions">
        <a className="btn btn-primary" href={createMarket(stockSymbol)} target="_blank" rel="noreferrer">
          Launch a {stockSymbol} market ↗
        </a>
        <a className="btn btn-ghost" href={browseMarkets()} target="_blank" rel="noreferrer">
          Browse markets
        </a>
      </div>
    </section>
  );
}

/** $225.19 → $230; $47.3 → $48; $1,234 → $1,250. A strike people would actually pick. */
export function roundStrike(p: number): number {
  const step = p >= 1000 ? 50 : p >= 200 ? 5 : p >= 50 ? 1 : p >= 10 ? 0.5 : 0.1;
  return Math.ceil(p / step) * step;
}
