import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSwapSteps } from '../hooks/useSwapSteps';
import { postStockQuote, type CounterSymbol, type Side, type StockOverview, type StockQuote } from '../lib/api';
import { amount as fmtAmount, usd } from '../lib/format';
import { txUrl } from '../lib/links';
import { ConnectBlock } from './Connect';
import { StepsList } from './StepsList';
import { StockLogo } from './TokenLogo';

/**
 * Buy and sell the stock token itself, for ETH or USDC.
 *
 * SHAPE. Two boxes, "you pay" over "you receive", the way every swap people have used works, so
 * nothing has to be explained. The pay box owns the amount, the asset picker and the balance with
 * a Max; the receive box shows what comes back and the rate. Percent chips size against the
 * balance when a wallet is connected (dollar presets mean nothing to a wallet holding $0.67) and
 * fall back to dollar examples when there is no wallet to size against. Shortfalls are caught on
 * the client the moment they are typed, not after a round trip.
 *
 * NUMBERS. The server asks KyberSwap's aggregator for the route, builds the transaction, simulates
 * it from this wallet and measures the fee it collects; this panel only shows what it is told. A
 * stale quote is re-fetched at the moment of signing (hooks/useSwapSteps).
 */

const GAS_RESERVE_ETH = 0.0003;
const USD_PRESETS = [25, 100, 250, 1000];
const PCT_PRESETS = [25, 50, 75, 100];

/** Which asset the person is spending; the quote request is built from this plus the entry unit. */
type Entry = 'token' | 'usd';

function CounterIcon({ symbol, size = 18 }: { symbol: CounterSymbol; size?: number }) {
  if (symbol === 'ETH') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#627eea" />
        <path d="M16 5v8.1l6.9 3.1z" fill="#fff" fillOpacity=".6" />
        <path d="M16 5l-6.9 11.2 6.9-3.1z" fill="#fff" />
        <path d="M16 21.6V27l6.9-9.6z" fill="#fff" fillOpacity=".6" />
        <path d="M16 27v-5.4l-6.9-4.2z" fill="#fff" />
        <path d="M16 20.3l6.9-4.1-6.9-3.1z" fill="#fff" fillOpacity=".2" />
        <path d="M9.1 16.2l6.9 4.1v-7.2z" fill="#fff" fillOpacity=".6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path d="M20.5 18.4c0-2.3-1.4-3.1-4.2-3.5-2-.3-2.4-.8-2.4-1.7s.7-1.6 2-1.6c1.2 0 1.9.4 2.2 1.4.1.2.3.3.5.3h1.1c.3 0 .5-.2.5-.5v-.1c-.3-1.5-1.5-2.6-3-2.8V8.3c0-.3-.2-.5-.6-.6h-1c-.3 0-.5.2-.6.6v1.5c-2 .3-3.3 1.6-3.3 3.3 0 2.2 1.3 3 4.1 3.4 1.9.3 2.5.7 2.5 1.8s-.9 1.8-2.2 1.8c-1.7 0-2.3-.7-2.5-1.7-.1-.3-.3-.4-.5-.4h-1.2c-.3 0-.5.2-.5.5v.1c.3 1.7 1.4 2.9 3.6 3.2v1.6c0 .3.2.5.6.6h1c.3 0 .5-.2.6-.6v-1.6c2-.3 3.3-1.7 3.3-3.4z" fill="#fff" />
      <path d="M12.6 25.5c-5.2-1.9-7.9-7.7-6-12.9 1-2.8 3.2-4.9 6-5.9.3-.1.4-.3.4-.6v-1c0-.3-.1-.4-.4-.5h-.2C6 6.6 2.5 13.4 4.5 19.8c1.2 3.8 4.1 6.7 7.9 7.9.3.1.5 0 .6-.3v-1c0-.3-.2-.6-.4-.9zm7.1-20.9c-.3-.1-.5 0-.6.3v1c0 .3.2.6.4.9 5.2 1.9 7.9 7.7 6 12.9-1 2.8-3.2 4.9-6 5.9-.3.1-.4.3-.4.6v1c0 .3.1.4.4.5h.2c6.4-2 9.9-8.8 7.9-15.2-1.2-3.9-4.2-6.8-7.9-7.9z" fill="#fff" />
    </svg>
  );
}

/** The one asset picker: ETH or USDC, as a segmented pill with the coin marks. */
function CounterPicker({ value, onChange, disabled }: { value: CounterSymbol; onChange: (c: CounterSymbol) => void; disabled?: boolean }) {
  return (
    <div className="asset-pick" role="tablist" aria-label="Asset">
      {(['ETH', 'USDC'] as const).map((c) => (
        <button key={c} role="tab" type="button" aria-selected={value === c} className={value === c ? 'on' : ''} onClick={() => onChange(c)} disabled={disabled}>
          <CounterIcon symbol={c} size={16} />
          {c}
        </button>
      ))}
    </div>
  );
}

/** The fixed asset on the other side: the stock token, styled like the picker so the two boxes match. */
function StockChip({ symbol, tokenSymbol, logo }: { symbol: string; tokenSymbol: string; logo?: string }) {
  return (
    <span className="asset-fixed">
      <StockLogo {...(logo ? { src: logo } : {})} symbol={symbol} size={16} />
      {tokenSymbol}
    </span>
  );
}

const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

export function StockTradePanel({ overview }: { overview: StockOverview }) {
  const qc = useQueryClient();
  /**
   * Deep links preset the card: `/s/NVDA?side=buy&amount=100&pay=USDC` opens it ready to go, so
   * the chat desk and shared links can land a person one signature from the trade. Amount is in
   * dollars for a buy and in stock tokens for a sell.
   */
  const [params] = useSearchParams();
  const presetSide: Side = params.get('side') === 'sell' ? 'sell' : 'buy';
  const presetPay: CounterSymbol = params.get('pay')?.toUpperCase() === 'USDC' ? 'USDC' : 'ETH';
  const presetAmount = clean(params.get('amount') ?? '');
  const [side, setSide] = useState<Side>(presetSide);
  const [counter, setCounter] = useState<CounterSymbol>(presetPay);
  const [entry, setEntry] = useState<Entry>(presetSide === 'sell' && presetAmount ? 'token' : 'usd');
  const [raw, setRaw] = useState(presetAmount);
  /** Sell everything: the server sizes from the live balance, so dust never gets left behind. */
  const [allIn, setAllIn] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const s = overview.stock;
  const sym = s.tokenSymbol;
  const spot = s.priceUsd;
  const ethUsd = overview.counters.find((c) => c.symbol === 'ETH')?.priceUsd;
  const counterUsd = counter === 'ETH' ? ethUsd : 1;
  const stockBal = Number(overview.wallet?.stock ?? 0);
  const counterBal = Number(counter === 'ETH' ? overview.wallet?.eth ?? 0 : overview.wallet?.usdc ?? 0);
  const tradeable = !!s.pool;
  const buy = side === 'buy';

  // What is being spent, in its own units and in dollars, whichever way it was typed.
  const payBal = buy ? counterBal : stockBal;
  const payPriceUsd = buy ? counterUsd : spot;
  const typed = Number(raw);
  const typedOk = Number.isFinite(typed) && typed > 0;
  const payAmount = allIn ? stockBal : entry === 'usd' ? (payPriceUsd ? typed / payPriceUsd : Number.NaN) : typed;
  const payUsd = allIn ? (spot ? stockBal * spot : undefined) : entry === 'usd' ? typed : payPriceUsd ? typed * payPriceUsd : undefined;
  const valid = allIn ? stockBal > 0 : typedOk && Number.isFinite(payAmount) && payAmount > 0;
  const spendable = buy && counter === 'ETH' ? Math.max(0, payBal - GAS_RESERVE_ETH) : payBal;
  const insufficient = overview.wallet !== undefined && valid && !allIn && payAmount > spendable + 1e-12;

  const getQuote = useCallback(
    async (wallet: string): Promise<StockQuote> => {
      if (buy) {
        return entry === 'usd'
          ? postStockQuote({ side: 'buy', wallet, stock: s.symbol, counter, amount: typed, unit: 'usd' })
          : postStockQuote({ side: 'buy', wallet, stock: s.symbol, counter, amount: typed, unit: 'counter' });
      }
      return allIn
        ? postStockQuote({ side: 'sell', wallet, stock: s.symbol, counter, amount: 0, unit: 'all' })
        : postStockQuote({ side: 'sell', wallet, stock: s.symbol, counter, amount: payAmount, unit: 'stock' });
    },
    [buy, entry, s.symbol, counter, typed, allIn, payAmount],
  );
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['stock'] });
    void qc.invalidateQueries({ queryKey: ['stocks'] });
    void qc.invalidateQueries({ queryKey: ['stock-candles'] });
  }, [qc]);
  const onDone = useCallback(() => {
    setRaw('');
    setAllIn(false);
    refresh();
  }, [refresh]);

  const { phase, quote, busy, resumable, go, isConnected, onBase, switching } = useSwapSteps<StockQuote>({
    getQuote,
    enabled: valid && tradeable && !insufficient,
    onDone,
    onReverted: refresh,
  });

  // Switching side or asset starts a fresh entry; a half-typed sell amount is not a buy amount.
  const reset = () => {
    setRaw('');
    setAllIn(false);
  };
  useEffect(() => {
    if (quote?.expectedOut) setShowDetails((v) => v);
  }, [quote]);

  // The receive side: the routed quote when there is one, an estimate from prices otherwise.
  const receiveExact = quote?.expectedOut !== undefined && quote.steps.length > 0 ? Number(quote.expectedOut) : undefined;
  const receiveEstimate =
    valid && spot
      ? buy
        ? payUsd !== undefined
          ? payUsd / spot
          : undefined
        : counterUsd
          ? (payAmount * spot) / counterUsd
          : undefined
      : undefined;
  const receive = receiveExact ?? receiveEstimate;
  const receiveUsd = receiveExact !== undefined ? quote?.expectedOutUsd : receive !== undefined ? (buy ? receive * (spot ?? 0) : receive * (counterUsd ?? 0)) : undefined;
  const receiveSym = buy ? sym : counter;
  const paySym = buy ? counter : sym;
  // One stock in the counter asset, from the quote's effective price when there is one.
  const ratePerStockUsd = quote?.priceUsdPerStock ?? spot;
  const rateInCounter = ratePerStockUsd !== undefined && counterUsd ? ratePerStockUsd / counterUsd : undefined;

  if (!tradeable) {
    return (
      <section className="card trade swap" aria-label="Trade">
        <div className="card-head">
          <span className="card-title">Trade {sym}</span>
          <span className="tag warn">no DEX market yet</span>
        </div>
        <p className="dim" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>
          {sym} is not trading on Base yet.
        </p>
        <a className="btn btn-ghost btn-block" href={s.links.basescan} target="_blank" rel="noreferrer">
          {sym} on Basescan ↗
        </a>
      </section>
    );
  }

  const setPct = (p: number) => {
    setEntry('token');
    if (!buy && p === 100) {
      setAllIn(true);
      setRaw(String(stockBal));
      return;
    }
    setAllIn(false);
    const v = (spendable * p) / 100;
    setRaw(v > 0 ? String(Number(v.toPrecision(8))) : '');
  };
  const setUsd = (v: number) => {
    setEntry('usd');
    setAllIn(false);
    setRaw(String(v));
  };
  const flipEntry = () => {
    // Keep the same value, re-expressed in the other unit, so flipping never empties the box.
    if (!payPriceUsd) return;
    if (entry === 'usd') {
      setEntry('token');
      if (typedOk) setRaw(String(Number((typed / payPriceUsd).toPrecision(8))));
    } else {
      setEntry('usd');
      if (typedOk) setRaw(String(Number((typed * payPriceUsd).toFixed(2))));
    }
    setAllIn(false);
  };

  const label = (() => {
    if (phase.at === 'quoting') return 'Finding the best route…';
    if (phase.at === 'signing') return phase.mining ? `Mining step ${phase.step + 1} of ${phase.quote.steps.length}…` : `Confirm in wallet · step ${phase.step + 1} of ${phase.quote.steps.length}`;
    if (resumable && phase.at === 'error') return `Retry from step ${(phase.step ?? 0) + 1}`;
    if (!valid) return 'Enter an amount';
    if (insufficient) return `Not enough ${paySym}`;
    if (phase.at === 'ready' && phase.quote.steps.length === 0) return 'Cannot trade this amount';
    return buy ? `Buy ${sym}` : `Sell ${sym}`;
  })();
  const disabled = busy || !valid || insufficient || (phase.at === 'ready' && phase.quote.steps.length === 0);

  return (
    <section className="card trade swap" aria-label="Trade">
      <div className="swap-top">
        <div className="side-tabs" role="tablist">
          <button role="tab" aria-selected={buy} className={`buy${buy ? ' on' : ''}`} onClick={() => (setSide('buy'), reset())}>
            Buy
          </button>
          <button role="tab" aria-selected={!buy} className={`sell${!buy ? ' on' : ''}`} onClick={() => (setSide('sell'), reset())}>
            Sell
          </button>
        </div>
        <span className="swap-slip" title="Maximum price movement accepted between quote and execution">
          {(overview.slippageBps / 100).toFixed(1)}% slippage
        </span>
      </div>

      {/* ── You pay ── */}
      <div className={`swap-box${insufficient ? ' short' : ''}`}>
        <div className="swap-box-head">
          <span>You pay</span>
          {isConnected && overview.wallet ? (
            <span className="swap-bal">
              Balance <b className="mono">{fmtAmount(payBal, buy && counter === 'ETH' ? 5 : buy ? 2 : 6)}</b>
              {spendable > 0 ? (
                <button type="button" onClick={() => setPct(100)}>
                  Max
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="swap-box-row">
          {entry === 'usd' && !allIn ? <span className={`swap-prefix${raw ? '' : ' faint'}`}>$</span> : null}
          <input
            inputMode="decimal"
            placeholder="0"
            value={allIn ? String(stockBal) : raw}
            onChange={(e) => {
              setRaw(clean(e.target.value));
              setAllIn(false);
            }}
            aria-label={`Amount in ${entry === 'usd' ? 'US dollars' : paySym}`}
            className={insufficient ? 'short' : ''}
          />
          {buy ? <CounterPicker value={counter} onChange={(c) => (setCounter(c), reset())} disabled={busy} /> : <StockChip symbol={s.symbol} tokenSymbol={sym} {...(s.logo ? { logo: s.logo } : {})} />}
        </div>
        <div className="swap-box-foot">
          {/* The conversion, and the tap that switches which unit you type in. */}
          <button type="button" className="swap-flip" onClick={flipEntry} disabled={!payPriceUsd} title={entry === 'usd' ? `Type in ${paySym}` : 'Type in dollars'}>
            <span className="swap-flip-ico">⇅</span>
            {entry === 'usd'
              ? valid
                ? `${fmtAmount(payAmount, buy && counter === 'ETH' ? 6 : 4)} ${paySym}`
                : paySym
              : valid && payUsd !== undefined
                ? usd(payUsd, { compact: false })
                : 'USD'}
          </button>
          {insufficient ? <span className="swap-short">Not enough {paySym}{buy && counter === 'ETH' ? ' after gas' : ''}</span> : null}
        </div>
      </div>

      <div className="swap-arrow" aria-hidden="true">
        <span>↓</span>
      </div>

      {/* ── You receive ── */}
      <div className="swap-box out">
        <div className="swap-box-head">
          <span>You receive{receiveExact === undefined && valid ? ' (estimate)' : ''}</span>
          {isConnected && overview.wallet ? (
            <span className="swap-bal">
              Balance <b className="mono">{fmtAmount(buy ? stockBal : counterBal, buy ? 6 : counter === 'ETH' ? 5 : 2)}</b>
            </span>
          ) : null}
        </div>
        <div className="swap-box-row">
          <div className={`swap-out mono${receive === undefined ? ' faint' : ''}${phase.at === 'quoting' ? ' pulse' : ''}`}>{receive !== undefined ? fmtAmount(receive, buy ? 6 : counter === 'ETH' ? 6 : 2) : '0'}</div>
          {buy ? <StockChip symbol={s.symbol} tokenSymbol={sym} {...(s.logo ? { logo: s.logo } : {})} /> : <CounterPicker value={counter} onChange={(c) => (setCounter(c), reset())} disabled={busy} />}
        </div>
        <div className="swap-box-foot">
          <span className="dim">{receiveUsd !== undefined && receive !== undefined ? `≈ ${usd(receiveUsd, { compact: false })}` : ''}</span>
          {rateInCounter !== undefined ? (
            <span className="swap-rate mono">
              1 {sym} = {fmtAmount(rateInCounter, counter === 'ETH' ? 5 : 2)} {counter}
              {ratePerStockUsd !== undefined ? <span className="faint"> · {usd(ratePerStockUsd, { compact: false })}</span> : null}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Quick sizes ── */}
      <div className="swap-chips" role="group" aria-label="Quick amounts">
        {isConnected && overview.wallet
          ? PCT_PRESETS.map((p) => (
              <button key={p} type="button" className={`chip${!allIn && !buy && p === 100 ? '' : ''}`} onClick={() => setPct(p)} disabled={spendable <= 0}>
                {p === 100 ? 'Max' : `${p}%`}
              </button>
            ))
          : USD_PRESETS.map((v) => (
              <button key={v} type="button" className="chip" onClick={() => setUsd(v)}>
                ${v}
              </button>
            ))}
      </div>

      {s.thin ? <div className="notice" style={{ marginTop: 12 }}>Thin market · large orders move the price</div> : null}

      {/* ── The quote's details, or the reason there is none ── */}
      {quote?.unavailableReason && quote.steps.length === 0 ? (
        <div className="swap-note">
          {quote.unavailableReason}
          {quote.needs?.getItAt ? (
            <a className="btn btn-sm" href={quote.needs.getItAt} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
              Get {quote.needs.token} ↗
            </a>
          ) : null}
        </div>
      ) : quote?.expectedOut && quote.steps.length > 0 ? (
        <div className="swap-details">
          <button type="button" className="swap-details-sum" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>
            <span>
              Min <b className="mono">{fmtAmount(quote.minOut, 6)}</b> {receiveSym} · fee {quote.fee ? `${(quote.fee.bps / 100).toFixed(2)}%` : 'none'} · {quote.steps.length}{' '}
              {quote.steps.length === 1 ? 'signature' : 'signatures'}
            </span>
            <span className={`swap-caret${showDetails ? ' open' : ''}`}>▾</span>
          </button>
          {showDetails ? (
            <dl className="swap-kv">
              <dt>Minimum received</dt>
              <dd>
                {fmtAmount(quote.minOut, 6)} {receiveSym} <span className="faint">after {quote.slippageBps / 100}% slippage</span>
              </dd>
              <dt>Squidlor fee</dt>
              <dd>
                {quote.fee ? (
                  <>
                    {fmtAmount(quote.fee.collected, 6)} {quote.fee.currency}
                    {quote.fee.usd !== undefined ? <span className="faint"> · {usd(quote.fee.usd, { compact: false })}</span> : null}
                  </>
                ) : (
                  'none'
                )}
              </dd>
              <dt>Route</dt>
              <dd className="swap-route">{quote.route.length ? quote.route.map((v) => v.replace(/-cl-\d+$/, '').replace(/-fee$/, '').replace(/^.*\//, '')).join(' → ') : 'aggregator'}</dd>
              {quote.gasUsd !== undefined ? (
                <>
                  <dt>Network fee</dt>
                  <dd>≈ {usd(quote.gasUsd, { compact: false })}</dd>
                </>
              ) : null}
              <dt>Signatures</dt>
              <dd>{quote.steps.map((st) => st.label).join(', then ')}</dd>
            </dl>
          ) : null}
        </div>
      ) : null}

      <StepsList phase={phase} />

      {phase.at === 'done' ? (
        <div className="result ok">
          {buy ? 'Bought' : 'Sold'} {sym}. {phase.hashes.length} {phase.hashes.length === 1 ? 'transaction' : 'transactions'} mined.{' '}
          <a href={txUrl(phase.hashes[phase.hashes.length - 1] ?? '')} target="_blank" rel="noreferrer">
            View on Basescan ↗
          </a>
        </div>
      ) : null}
      {phase.at === 'error' ? <div className="result err">{phase.message}</div> : null}

      <div className="swap-cta">
        {!isConnected ? (
          <ConnectBlock label={`Connect wallet to ${buy ? 'buy' : 'sell'} ${sym}`} />
        ) : !onBase ? (
          <button className="btn btn-primary btn-block btn-lg" onClick={go} disabled={switching}>
            {switching ? 'Switching…' : 'Switch wallet to Base'}
          </button>
        ) : (
          <button className={`btn btn-block btn-lg ${disabled && phase.at !== 'quoting' && phase.at !== 'signing' ? 'btn-muted' : buy ? 'btn-buy' : 'btn-sell'}`} onClick={go} disabled={disabled}>
            {label}
          </button>
        )}
      </div>

    </section>
  );
}
