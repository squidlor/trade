import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSwapSteps } from '../hooks/useSwapSteps';
import { postStockQuote, type CounterSymbol, type Side, type StockBuyUnit, type StockOverview, type StockQuote, type StockSellUnit } from '../lib/api';
import { amount as fmtAmount, usd } from '../lib/format';
import { txUrl } from '../lib/links';
import { ConnectBlock } from './Connect';
import { StepsList } from './StepsList';

/**
 * Buy and sell the stock token itself, for ETH or USDC.
 *
 * The server asks KyberSwap's aggregator for the best route across Base's DEXes (Aerodrome
 * Slipstream holds most of the stock tokens' liquidity), builds the transaction, and simulates it
 * from this wallet before returning it, so a wallet the token's transfer policy blocks hears that
 * here rather than from a reverted transaction. Squidlor's fee is collected by the router in the
 * same transaction and is already out of the numbers shown.
 */
export function StockTradePanel({ overview }: { overview: StockOverview }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<Side>('buy');
  const [counter, setCounter] = useState<CounterSymbol>('ETH');
  const [buyUnit, setBuyUnit] = useState<StockBuyUnit>('usd');
  const [sellUnit, setSellUnit] = useState<StockSellUnit>('stock');
  const [raw, setRaw] = useState('');

  const s = overview.stock;
  const sym = s.tokenSymbol;
  const spot = s.priceUsd;
  const ethUsd = overview.counters.find((c) => c.symbol === 'ETH')?.priceUsd;
  const counterUsd = counter === 'ETH' ? ethUsd : 1;
  const stockBal = Number(overview.wallet?.stock ?? 0);
  const counterBal = Number(counter === 'ETH' ? overview.wallet?.eth ?? 0 : overview.wallet?.usdc ?? 0);
  const unit = side === 'buy' ? buyUnit : sellUnit;
  const amount = unit === 'all' ? stockBal : Number(raw);
  const valid = unit === 'all' ? stockBal > 0 : Number.isFinite(amount) && amount > 0;
  const tradeable = !!s.pool;

  const getQuote = useCallback(
    async (wallet: string): Promise<StockQuote> =>
      side === 'buy'
        ? postStockQuote({ side: 'buy', wallet, stock: s.symbol, counter, amount, unit: buyUnit })
        : postStockQuote({ side: 'sell', wallet, stock: s.symbol, counter, amount: sellUnit === 'all' ? 0 : amount, unit: sellUnit }),
    [s.symbol, side, counter, amount, buyUnit, sellUnit],
  );
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['stock'] });
    void qc.invalidateQueries({ queryKey: ['stocks'] });
    void qc.invalidateQueries({ queryKey: ['stock-candles'] });
  }, [qc]);
  const onDone = useCallback(() => {
    setRaw('');
    refresh();
  }, [refresh]);

  const { phase, quote, busy, resumable, go, isConnected, onBase, switching } = useSwapSteps<StockQuote>({ getQuote, enabled: valid && tradeable, onDone, onReverted: refresh });

  // With no wallet to simulate from, an estimate from the current prices.
  const indicative =
    !isConnected && valid && spot
      ? side === 'buy'
        ? buyUnit === 'usd'
          ? amount / spot
          : counterUsd !== undefined
            ? (amount * counterUsd) / spot
            : undefined
        : counterUsd !== undefined
          ? (amount * spot) / counterUsd
          : undefined
      : undefined;

  if (!tradeable) {
    return (
      <section className="card trade" aria-label="Trade">
        <div className="card-head">
          <span className="card-title">Trade {sym}</span>
          <span className="tag warn">no DEX market yet</span>
        </div>
        <p className="dim" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>
          No pool for {sym} has been indexed on Base yet, so there is nothing to route a swap through. Check back once it starts trading.
        </p>
        <a className="btn btn-ghost btn-block" href={s.links.basescan} target="_blank" rel="noreferrer">
          {sym} on Basescan ↗
        </a>
      </section>
    );
  }

  const presets = side === 'buy' ? (buyUnit === 'usd' ? [25, 100, 250, 1000] : counter === 'ETH' ? [0.01, 0.05, 0.1, 0.5] : [25, 100, 250, 1000]) : [25, 50, 75, 100];
  const outSym = side === 'buy' ? sym : counter;

  return (
    <section className="card trade" aria-label="Trade">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={side === 'buy'} className={`buy${side === 'buy' ? ' on' : ''}`} onClick={() => (setSide('buy'), setRaw(''))}>
          Buy
        </button>
        <button role="tab" aria-selected={side === 'sell'} className={`sell${side === 'sell' ? ' on' : ''}`} onClick={() => (setSide('sell'), setSellUnit('stock'), setRaw(''))}>
          Sell
        </button>
      </div>

      <div className="field">
        <div className="field-top">
          <span>{side === 'buy' ? `You pay in` : `You sell ${sym} for`}</span>
          <span className="counter-pick" role="tablist" aria-label="Pay with">
            {(['ETH', 'USDC'] as const).map((c) => (
              <button key={c} role="tab" aria-selected={counter === c} className={counter === c ? 'on' : ''} onClick={() => setCounter(c)}>
                {c}
              </button>
            ))}
          </span>
        </div>
        <div className="field-row">
          <input
            inputMode="decimal"
            placeholder="0"
            value={unit === 'all' ? String(stockBal) : raw}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setRaw(v);
              if (side === 'sell') setSellUnit('stock');
            }}
            aria-label="Amount"
          />
          {side === 'buy' ? (
            <div className="unit" role="tablist" aria-label="Unit">
              <button className={buyUnit === 'usd' ? 'on' : ''} onClick={() => setBuyUnit('usd')}>
                USD
              </button>
              <button className={buyUnit === 'counter' ? 'on' : ''} onClick={() => setBuyUnit('counter')}>
                {counter}
              </button>
            </div>
          ) : (
            <span className="unit">
              <button className="on">{sym}</button>
            </span>
          )}
        </div>
        <div className="presets">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => {
                if (side === 'buy') setRaw(String(p));
                else if (p === 100) (setSellUnit('all'), setRaw(String(stockBal)));
                else (setSellUnit('stock'), setRaw(((stockBal * p) / 100).toString()));
              }}
            >
              {side === 'buy' ? (buyUnit === 'usd' ? `$${p}` : p) : `${p}%`}
            </button>
          ))}
          {isConnected ? (
            <button
              className="bal"
              onClick={() => {
                if (side === 'buy') (setBuyUnit('counter'), setRaw(String(counterBal)));
                else (setSellUnit('all'), setRaw(String(stockBal)));
              }}
            >
              balance {side === 'buy' ? `${fmtAmount(counterBal, 5)} ${counter}` : `${fmtAmount(stockBal, 6)} ${sym}`}
            </button>
          ) : null}
        </div>
      </div>

      {s.thin ? <div className="notice" style={{ marginTop: 10 }}>Thin market: the deepest {sym} pool holds under $50k. Small sizes only, and expect the price to move against you.</div> : null}

      {quote && (quote.expectedOut || quote.unavailableReason) ? (
        <div className="quote">
          {quote.expectedOut ? (
            <>
              <div className="quote-row hero">
                <span>You receive about</span>
                <b>
                  {fmtAmount(quote.expectedOut, side === 'buy' ? 6 : counter === 'ETH' ? 6 : 2)} {outSym}
                  {quote.expectedOutUsd !== undefined ? <span className="dim"> · {usd(quote.expectedOutUsd)}</span> : null}
                </b>
              </div>
              <div className="quote-row">
                <span>Minimum after {quote.slippageBps / 100}% slippage</span>
                <b>
                  {fmtAmount(quote.minOut, 6)} {outSym}
                </b>
              </div>
              <div className="quote-row">
                <span>Effective price</span>
                <b>{quote.priceUsdPerStock !== undefined ? `${usd(quote.priceUsdPerStock, { compact: false })} / ${sym}` : '–'}</b>
              </div>
              <div className="quote-row">
                <span>Squidlor fee</span>
                <b>{quote.fee ? `${(quote.fee.bps / 100).toFixed(2)}%${quote.fee.usd !== undefined ? ` · ${usd(quote.fee.usd, { compact: false })}` : ''}` : 'none'}</b>
              </div>
              <div className="quote-row">
                <span>Route</span>
                <b className="route">{quote.route.length ? quote.route.map((v) => v.replace(/-cl-\d+$/, '').replace(/-fee$/, '')).join(' → ') : 'aggregator'}</b>
              </div>
              <div className="quote-row">
                <span>Signatures</span>
                <b>
                  {quote.steps.length} {quote.steps.length === 1 ? 'step' : 'steps'}
                  {quote.gasUsd !== undefined ? <span className="dim"> · gas about {usd(quote.gasUsd, { compact: false })}</span> : null}
                </b>
              </div>
            </>
          ) : (
            <>
              <div className="dim">{quote.unavailableReason}</div>
              {quote.needs?.getItAt ? (
                <div style={{ marginTop: 10 }}>
                  <a className="btn btn-sm" href={quote.needs.getItAt} target="_blank" rel="noreferrer">
                    Get {quote.needs.token} ↗
                  </a>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : indicative !== undefined ? (
        <div className="quote">
          <div className="quote-row hero">
            <span>About</span>
            <b>
              {fmtAmount(indicative, 6)} {outSym}
            </b>
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            Indicative, from the current price. Connect a wallet for an exact routed quote.
          </div>
        </div>
      ) : null}

      <StepsList phase={phase} />

      {phase.at === 'done' ? (
        <div className="result ok">
          {side === 'buy' ? 'Bought' : 'Sold'} · all {phase.hashes.length} {phase.hashes.length === 1 ? 'transaction' : 'transactions'} mined.{' '}
          <a href={txUrl(phase.hashes[phase.hashes.length - 1] ?? '')} target="_blank" rel="noreferrer">
            View the swap on Basescan ↗
          </a>
        </div>
      ) : null}
      {phase.at === 'error' ? <div className="result err">{phase.message}</div> : null}

      <div style={{ marginTop: 14 }}>
        {!isConnected ? (
          <ConnectBlock />
        ) : !onBase ? (
          <button className="btn btn-primary btn-block" onClick={go} disabled={switching}>
            {switching ? 'Switching…' : 'Switch wallet to Base'}
          </button>
        ) : (
          <button
            className={`btn btn-block ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
            onClick={go}
            disabled={busy || !valid || (phase.at === 'ready' && phase.quote.steps.length === 0)}
          >
            {phase.at === 'quoting'
              ? 'Routing…'
              : phase.at === 'signing'
                ? phase.mining
                  ? `Mining step ${phase.step + 1}…`
                  : `Confirm step ${phase.step + 1} of ${phase.quote.steps.length}`
                : resumable && phase.at === 'error'
                  ? `Retry from step ${(phase.step ?? 0) + 1}`
                  : !valid
                    ? 'Enter an amount'
                    : side === 'buy'
                      ? `Buy ${sym} with ${counter}`
                      : `Sell ${sym} for ${counter}`}
          </button>
        )}
      </div>

      {isConnected && overview.wallet ? (
        <div className="position">
          <div className="position-row">
            <span>Your {sym}</span>
            <b>
              {fmtAmount(stockBal, 6)}
              {spot && stockBal > 0 ? <span className="dim"> · {usd(stockBal * spot)}</span> : null}
            </b>
          </div>
          <div className="position-row">
            <span>Your ETH</span>
            <b>
              {fmtAmount(Number(overview.wallet.eth), 5)}
              {ethUsd && Number(overview.wallet.eth) > 0 ? <span className="dim"> · {usd(Number(overview.wallet.eth) * ethUsd)}</span> : null}
            </b>
          </div>
          <div className="position-row">
            <span>Your USDC</span>
            <b>{fmtAmount(Number(overview.wallet.usdc), 2)}</b>
          </div>
        </div>
      ) : null}

      <div className="trade-foot">
        Routed across Base DEXes by KyberSwap's aggregator; the quote is that route simulated from your wallet on the current block. Squidlor's fee
        {overview.fee ? ` (${(overview.fee.bps / 100).toFixed(2)}%)` : ''} is taken by the router inside the same transaction. Not available to US persons.
      </div>
    </section>
  );
}
