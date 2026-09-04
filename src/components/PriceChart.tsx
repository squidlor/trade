import { useQuery } from '@tanstack/react-query';
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { INTERVALS, fetchCandles, type Candle, type Interval } from '../lib/api';
import { usd } from '../lib/format';

const UP = '#4ade80';
const DOWN = '#fb7185';

/** A price step one thousandth of the price, so a 4e-6 token does not render as 0.00. */
const minMoveFor = (candles: Candle[]): number => {
  const last = candles[candles.length - 1]?.c ?? 1;
  if (!(last > 0)) return 0.01;
  return 10 ** (Math.floor(Math.log10(last)) - 3);
};

/**
 * Candles and volume for one token, drawn with lightweight-charts. The chart is created once and
 * fed data on change; interval tabs re-query and replace the series data rather than the chart,
 * so the axis does not flash. Colours follow the theme tokens rather than the library defaults.
 */
export function PriceChart({
  tokenKey,
  symbol,
  spotUsd,
  mcapUsd,
  load,
}: {
  tokenKey: string;
  symbol: string;
  spotUsd?: number;
  mcapUsd?: number;
  /** Where candles come from. Default: the launched token's pool; the stock page passes its own. */
  load?: (interval: Interval) => Promise<{ indexed: boolean; candles: Candle[] }>;
}) {
  const [interval, setInterval_] = useState<Interval>('1h');
  const q = useQuery({
    queryKey: [load ? 'stock-candles' : 'candles', tokenKey, interval],
    queryFn: () => (load ? load(interval) : fetchCandles(tokenKey, interval)),
    refetchInterval: interval === '1m' ? 15_000 : 60_000,
  });

  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volSeries = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const c = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9d93ae',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: 'rgba(123,77,255,0.07)' }, horzLines: { color: 'rgba(123,77,255,0.07)' } },
      rightPriceScale: { borderColor: 'rgba(123,77,255,0.18)', scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: 'rgba(123,77,255,0.18)', timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        vertLine: { color: 'rgba(185,140,255,0.5)', labelBackgroundColor: '#7b4dff' },
        horzLine: { color: 'rgba(185,140,255,0.5)', labelBackgroundColor: '#7b4dff' },
      },
      handleScroll: true,
      handleScale: true,
    });
    const cs = c.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: 'custom', formatter: (p: number) => usd(p, { compact: false }), minMove: 0.000001 },
    });
    const vs = c.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      color: 'rgba(123,77,255,0.35)',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    candleSeries.current = cs;
    volSeries.current = vs;
    return () => {
      c.remove();
      chart.current = null;
      candleSeries.current = null;
      volSeries.current = null;
    };
  }, []);

  const candles = q.data?.candles ?? [];
  useEffect(() => {
    const cs = candleSeries.current;
    const vs = volSeries.current;
    if (!cs || !vs) return;
    cs.applyOptions({ priceFormat: { type: 'custom', formatter: (p: number) => usd(p, { compact: false }), minMove: minMoveFor(candles) } });
    cs.setData(candles.map((k) => ({ time: (k.t / 1000) as UTCTimestamp, open: k.o, high: k.h, low: k.l, close: k.c })));
    vs.setData(candles.map((k) => ({ time: (k.t / 1000) as UTCTimestamp, value: k.v, color: k.c >= k.o ? 'rgba(74,222,128,0.35)' : 'rgba(251,113,133,0.35)' })));
    chart.current?.timeScale().fitContent();
  }, [candles]);

  const first = candles[0];
  const last = candles[candles.length - 1];
  const change = first && last && first.o > 0 ? ((last.c - first.o) / first.o) * 100 : undefined;
  const volume = candles.reduce((s, k) => s + k.v, 0);
  const empty = q.isSuccess && candles.length === 0;

  return (
    <section className="card chart-card" aria-label="Price chart">
      <div className="chart-top">
        <div className="tabs" role="tablist" aria-label="Interval">
          {INTERVALS.map((i) => (
            <button key={i} role="tab" aria-selected={i === interval} className={i === interval ? 'on' : ''} onClick={() => setInterval_(i)}>
              {i}
            </button>
          ))}
        </div>
        <div className="legend">
          {last ? (
            <>
              <span>
                O <b className="mono">{usd(last.o, { compact: false })}</b>
              </span>
              <span>
                C <b className="mono">{usd(last.c, { compact: false })}</b>
              </span>
              {change !== undefined ? <span className={change >= 0 ? 'up' : 'down'}>{`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`} window</span> : null}
              <span>
                vol <b className="mono">{usd(volume)}</b>
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="chart-box">
        <div ref={box} />
        {q.isPending ? <div className="chart-empty dim">loading chart…</div> : null}
        {empty ? (
          <div className="chart-empty">
            <div>
              <b>No trades yet</b>
              {spotUsd !== undefined ? (
                <>
                  ${symbol} is priced on-chain at {usd(spotUsd, { compact: false })}
                  {mcapUsd !== undefined ? ` (${usd(mcapUsd)} market cap)` : ''}. The chart begins with the first trade.
                </>
              ) : (
                <>The chart begins once the pool is indexed after its first trade.</>
              )}
            </div>
          </div>
        ) : null}
        {q.isError ? (
          <div className="chart-empty">
            <div>
              <b>Chart unavailable</b>
              {q.error.message}
            </div>
          </div>
        ) : null}
      </div>
      <div className="chart-foot">DEX pool candles in USD via GeckoTerminal · not an oracle price</div>
    </section>
  );
}
