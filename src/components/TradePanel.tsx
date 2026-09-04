import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSwapSteps } from '../hooks/useSwapSteps';
import { postQuote, type BuyUnit, type Quote, type SellUnit, type Side, type TokenOverview } from '../lib/api';
import { amount as fmtAmount, usd } from '../lib/format';
import { buyStockUrl, txUrl } from '../lib/links';
import { ConnectBlock } from './Connect';
import { StepsList } from './StepsList';

/**
 * Buy and sell a launched token, against the server's simulated quote.
 *
 * WHAT THE SERVER DOES AND THIS DOES NOT. The quote is the real swap run through eth_simulateV1
 * from this wallet, so `expectedOut` is what the router would return on the current block and the
 * steps are the exact calldata, approvals included only when missing. This panel never builds
 * calldata: the signing loop (hooks/useSwapSteps) asks, shows, and hands each step to the wallet.
 *
 * A buy is PAID IN THE STOCK TOKEN (NVDAc for an NVDA-paired token), never in ETH. When the wallet
 * has none the server says so, with where to get it, and the panel relays that instead of failing.
 */
export function TradePanel({ overview }: { overview: TokenOverview }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<Side>('buy');
  const [buyUnit, setBuyUnit] = useState<BuyUnit>('usd');
  const [sellUnit, setSellUnit] = useState<SellUnit>('tokens');
  const [raw, setRaw] = useState('');

  const sym = overview.token.symbol || 'token';
  const stockSym = overview.stock.tokenSymbol;
  const spot = overview.market?.priceUsd ?? overview.spot?.priceUsd;
  const tokenBal = Number(overview.wallet?.tokenBalance ?? 0);
  const stockBal = Number(overview.wallet?.stockBalance ?? 0);
  const unit = side === 'buy' ? buyUnit : sellUnit;
  const amount = unit === 'all' ? tokenBal : Number(raw);
  const valid = unit === 'all' ? tokenBal > 0 : Number.isFinite(amount) && amount > 0;

  const getQuote = useCallback(
    async (wallet: string): Promise<Quote> => postQuote({ wallet, token: overview.token.address, side, amount: unit === 'all' ? 0 : amount, unit }),
    [overview.token.address, side, amount, unit],
  );
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['token'] });
    void qc.invalidateQueries({ queryKey: ['trades'] });
    void qc.invalidateQueries({ queryKey: ['candles'] });
  }, [qc]);
  const onDone = useCallback(() => {
    setRaw('');
    refresh();
  }, [refresh]);

  const { phase, quote, busy, resumable, go, isConnected, onBase, switching } = useSwapSteps<Quote>({ getQuote, enabled: valid && overview.tradeable, onDone, onReverted: refresh });

  const indicativeOut = !isConnected && spot && valid && side === 'buy' ? (buyUnit === 'usd' ? amount / spot : (amount * overview.stock.priceUsd) / spot) : undefined;
  const indicativeIn = !isConnected && spot && valid && side === 'sell' ? (amount * spot) / (overview.stock.priceUsd || 1) : undefined;

  if (!overview.tradeable) {
    return (
      <section className="card trade" aria-label="Trade">
        <div className="card-head">
          <span className="card-title">Trade ${sym}</span>
          <span className="tag warn">not on Doppler</span>
        </div>
        <p className="dim" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>
          {overview.unavailableReason ?? 'This token was not launched through Doppler, so Squidlor cannot build its swap here.'}
        </p>
        <a className="btn btn-primary btn-block" href={overview.links.uniswap} target="_blank" rel="noreferrer">
          Trade ${sym} on Uniswap ↗
        </a>
      </section>
    );
  }

  const presets = side === 'buy' ? (buyUnit === 'usd' ? [10, 25, 100, 250] : [0.01, 0.05, 0.1, 0.5]) : [25, 50, 75, 100];

  return (
    <section className="card trade" aria-label="Trade">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={side === 'buy'} className={`buy${side === 'buy' ? ' on' : ''}`} onClick={() => (setSide('buy'), setRaw(''))}>
          Buy
        </button>
        <button role="tab" aria-selected={side === 'sell'} className={`sell${side === 'sell' ? ' on' : ''}`} onClick={() => (setSide('sell'), setSellUnit('tokens'), setRaw(''))}>
          Sell
        </button>
      </div>

      <div className="field">
        <div className="field-top">
          <span>{side === 'buy' ? `You pay in ${stockSym}` : `You sell ${sym}`}</span>
          {isConnected ? (
            side === 'buy' ? (
              <button onClick={() => (setBuyUnit('stock'), setRaw(String(stockBal)))}>balance {fmtAmount(stockBal)} {stockSym}</button>
            ) : (
              <button onClick={() => (setSellUnit('all'), setRaw(String(tokenBal)))}>balance {fmtAmount(tokenBal)}</button>
            )
          ) : null}
        </div>
        <div className="field-row">
          <input
            inputMode="decimal"
            placeholder="0"
            value={unit === 'all' ? String(tokenBal) : raw}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setRaw(v);
              if (side === 'sell') setSellUnit('tokens');
            }}
            aria-label="Amount"
          />
          {side === 'buy' ? (
            <div className="unit" role="tablist" aria-label="Unit">
              <button className={buyUnit === 'usd' ? 'on' : ''} onClick={() => setBuyUnit('usd')}>
                USD
              </button>
              <button className={buyUnit === 'stock' ? 'on' : ''} onClick={() => setBuyUnit('stock')}>
                {stockSym}
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
                else if (p === 100) (setSellUnit('all'), setRaw(String(tokenBal)));
                else (setSellUnit('tokens'), setRaw(((tokenBal * p) / 100).toString()));
              }}
            >
              {side === 'buy' ? (buyUnit === 'usd' ? `$${p}` : p) : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      {/* The quote, or the indicative estimate when there is no wallet to simulate from. */}
      {quote && (quote.expectedOut || quote.unavailableReason) ? (
        <div className="quote">
          {quote.expectedOut ? (
            <>
              <div className="quote-row hero">
                <span>You receive about</span>
                <b>
                  {fmtAmount(quote.expectedOut)} {side === 'buy' ? sym : stockSym}
                  {quote.expectedOutUsd !== undefined ? <span className="dim"> · {usd(quote.expectedOutUsd)}</span> : null}
                </b>
              </div>
              <div className="quote-row">
                <span>Minimum after {quote.slippageBps / 100}% slippage</span>
                <b>
                  {fmtAmount(quote.minOut)} {side === 'buy' ? sym : stockSym}
                </b>
              </div>
              <div className="quote-row">
                <span>Price</span>
                <b>{quote.priceUsdPerToken !== undefined ? `${usd(quote.priceUsdPerToken, { compact: false })} / ${sym}` : '–'}</b>
              </div>
              <div className="quote-row">
                <span>Pool fee</span>
                <b>{quote.dynamicFee ? 'dynamic' : quote.feePercent !== undefined ? `${quote.feePercent}%` : '–'}</b>
              </div>
              <div className="quote-row">
                <span>Signatures</span>
                <b>
                  {quote.steps.length} {quote.steps.length === 1 ? 'step' : 'steps'}
                </b>
              </div>
            </>
          ) : (
            <>
              <div className="dim">{quote.unavailableReason}</div>
              {quote.needs?.getItAt ? (
                <div style={{ marginTop: 10 }}>
                  <a className="btn btn-sm" href={side === 'buy' ? buyStockUrl(overview.stock.address) : quote.needs.getItAt} target="_blank" rel="noreferrer">
                    Get {quote.needs.token} on Uniswap ↗
                  </a>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : indicativeOut !== undefined || indicativeIn !== undefined ? (
        <div className="quote">
          <div className="quote-row hero">
            <span>About</span>
            <b>{indicativeOut !== undefined ? `${fmtAmount(indicativeOut)} ${sym}` : `${fmtAmount(indicativeIn, 6)} ${stockSym}`}</b>
          </div>
          <div className="dim" style={{ fontSize: 12 }}>
            Indicative, from the current price. Connect a wallet for an exact simulated quote.
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
              ? 'Quoting…'
              : phase.at === 'signing'
                ? phase.mining
                  ? `Mining step ${phase.step + 1}…`
                  : `Confirm step ${phase.step + 1} of ${phase.quote.steps.length}`
                : resumable && phase.at === 'error'
                  ? `Retry from step ${(phase.step ?? 0) + 1}`
                  : !valid
                    ? 'Enter an amount'
                    : side === 'buy'
                      ? `Buy $${sym}`
                      : `Sell $${sym}`}
          </button>
        )}
      </div>

      {isConnected ? (
        <div className="position">
          <div className="position-row">
            <span>Your ${sym}</span>
            <b>
              {fmtAmount(tokenBal)}
              {spot && tokenBal > 0 ? <span className="dim"> · {usd(tokenBal * spot)}</span> : null}
            </b>
          </div>
          {tokenBal > 0 && overview.token.totalSupply ? (
            <div className="position-row">
              <span>Share of supply</span>
              <b>{((tokenBal / overview.token.totalSupply) * 100).toFixed(3)}%</b>
            </div>
          ) : null}
          <div className="position-row">
            <span>Your {stockSym}</span>
            <b>
              {fmtAmount(stockBal, 6)}
              {stockBal > 0 ? <span className="dim"> · {usd(stockBal * overview.stock.priceUsd)}</span> : null}
            </b>
          </div>
        </div>
      ) : null}

      <div className="trade-foot">
        Buys are paid in {stockSym}, the tokenized stock this token trades against, on Uniswap v4 via the Universal Router. First trades need one or two
        approvals; the quote is the swap simulated on the current block.
      </div>
    </section>
  );
}
