import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isAddress, isHex } from 'viem';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { Avatar } from '../components/Avatar';
import { ConnectBlock } from './../components/Connect';
import { ApiError, fetchLaunchConfig, postConfirm, postPrepare, type LaunchRecord, type PreparedLaunch } from '../lib/api';
import { amount, usd } from '../lib/format';
import { askGeyser, txUrl } from '../lib/links';
import { CHAIN } from '../lib/wagmi';

/**
 * Launch a token without the chat. Same server, same calldata, same rules as the GEYSER desk: the
 * page collects a name, a symbol, a stock and an opening market cap, and the server builds and
 * simulates the create transaction. The wallet signs one or two transactions in order; the page
 * waits for each receipt, posts the result back so the launch is recorded, and hands over to the
 * token's page.
 *
 * Nothing here signs or builds calldata. The second signature (when the server asks for two) is
 * a small reservation transfer the server verifies before it will hand out the create calldata.
 */

const CAP_PRESETS = [4_000, 10_000, 25_000, 50_000];
/** $4k, $25k, $1M: the way a market cap is said out loud. */
const cap$ = (n: number): string => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}k` : `$${n}`);

type Phase =
  | { at: 'form' }
  | { at: 'reserve' }
  | { at: 'reserving'; hash: string }
  | { at: 'preparing'; feeTxHash?: string }
  | { at: 'create'; prepared: PreparedLaunch; feeTxHash?: string }
  | { at: 'creating'; prepared: PreparedLaunch; hash: string; feeTxHash?: string }
  | { at: 'recording'; prepared: PreparedLaunch; hash: string }
  | { at: 'live'; record: LaunchRecord; hash: string }
  | { at: 'error'; message: string; resume?: Phase };

const firstLine = (e: unknown): string => {
  if (e instanceof ApiError) return e.message;
  const r = e as { shortMessage?: string; message?: string } | undefined;
  const m = r?.shortMessage ?? r?.message ?? String(e);
  if (/user rejected|user denied|rejected the request/i.test(m)) return 'Rejected in the wallet. Nothing was sent.';
  return m.split('\n')[0]?.slice(0, 180) ?? 'Something went wrong.';
};

const cleanSymbol = (v: string) => v.replace(/^\$/, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);

export function LaunchPage() {
  const [params] = useSearchParams();
  const cfg = useQuery({ queryKey: ['launch-config'], queryFn: fetchLaunchConfig, staleTime: 5 * 60_000 });
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [stock, setStock] = useState(params.get('stock')?.toUpperCase() ?? 'NVDA');
  const [cap, setCap] = useState<number>(4_000);
  const [customCap, setCustomCap] = useState('');
  const [phase, setPhase] = useState<Phase>({ at: 'form' });

  useEffect(() => {
    document.title = 'Launch a token · Squidlor Trade';
  }, []);

  const stocks = cfg.data?.stocks ?? [];
  const chosen = stocks.find((s) => s.symbol === stock) ?? stocks[0];
  const limits = cfg.data?.limits ?? { startMcUsd: { min: 1_000, max: 1_000_000 }, name: 32, symbol: 10 };
  const capValue = customCap ? Number(customCap) : cap;
  const capOk = Number.isFinite(capValue) && capValue >= limits.startMcUsd.min && capValue <= limits.startMcUsd.max;
  const nameOk = name.trim().length >= 1 && name.trim().length <= limits.name;
  const symOk = /^[A-Z0-9]{1,10}$/.test(symbol);
  const formOk = nameOk && symOk && !!chosen && capOk;
  const onBase = chainId === CHAIN.id;
  const supply = cfg.data?.defaults.supplyTokens ?? 1_000_000_000;
  const openPrice = capOk ? capValue / supply : undefined;
  const creatorShareBps = 10_000 - (cfg.data?.feeShare.protocolBps ?? 500) - (cfg.data?.feeShare.treasuryBps ?? 0);

  const busy = ['reserve', 'reserving', 'preparing', 'create', 'creating', 'recording'].includes(phase.at) || switching;

  const send = async (tx: { to: string; data: string; value: string; gasLimit?: number }): Promise<`0x${string}`> => {
    if (!isAddress(tx.to) || !isHex(tx.data)) throw new Error('The server returned a malformed transaction.');
    return sendTransactionAsync({ to: tx.to, data: tx.data, value: BigInt(tx.value || '0'), chainId: CHAIN.id, ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}) });
  };
  const mined = async (hash: `0x${string}`, what: string) => {
    if (!publicClient) throw new Error('No RPC client for Base.');
    const rc = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
    if (rc.status === 'reverted') throw new Error(`${what} reverted on-chain.`);
  };

  const launch = async (from: Phase = phase) => {
    if (!address || !chosen || !cfg.data) return;
    if (!onBase) {
      try {
        await switchChainAsync({ chainId: CHAIN.id });
      } catch (e) {
        setPhase({ at: 'error', message: firstLine(e) });
      }
      return;
    }
    let feeTxHash: string | undefined = 'feeTxHash' in from ? from.feeTxHash : undefined;
    let prepared: PreparedLaunch | undefined = 'prepared' in from ? from.prepared : undefined;
    try {
      // Step 1: the reservation transfer, only when the server asks for one and it has not been paid yet.
      if (cfg.data.fee && !feeTxHash) {
        setPhase({ at: 'reserve' });
        const hash = await send({ to: cfg.data.fee.treasury, data: '0x', value: cfg.data.fee.wei, gasLimit: 30_000 });
        setPhase({ at: 'reserving', hash });
        await mined(hash, 'The reservation');
        feeTxHash = hash;
      }
      // Step 2: the create transaction, built and simulated by the server.
      if (!prepared) {
        setPhase({ at: 'preparing', ...(feeTxHash ? { feeTxHash } : {}) });
        prepared = await postPrepare({ creator: address, name: name.trim(), symbol, stock: chosen.symbol, startMcUsd: capValue, ...(feeTxHash ? { feeTxHash } : {}) });
      }
      setPhase({ at: 'create', prepared, ...(feeTxHash ? { feeTxHash } : {}) });
      const hash = await send(prepared.transaction);
      setPhase({ at: 'creating', prepared, hash, ...(feeTxHash ? { feeTxHash } : {}) });
      await mined(hash, 'The launch');
      // Step 3: the server reads the receipt and records the token from the chain's own event.
      setPhase({ at: 'recording', prepared, hash });
      const record = await postConfirm(hash, feeTxHash);
      void qc.invalidateQueries({ queryKey: ['board'] });
      setPhase({ at: 'live', record, hash });
    } catch (e) {
      const resume: Phase | undefined = prepared
        ? { at: 'create', prepared, ...(feeTxHash ? { feeTxHash } : {}) }
        : feeTxHash
          ? { at: 'preparing', feeTxHash }
          : undefined;
      setPhase({ at: 'error', message: firstLine(e), ...(resume ? { resume } : {}) });
    }
  };

  const stepIndex = useMemo(() => {
    switch (phase.at) {
      case 'reserve':
      case 'reserving':
        return 0;
      case 'preparing':
      case 'create':
      case 'creating':
        return 1;
      case 'recording':
        return 2;
      case 'live':
        return 3;
      default:
        return -1;
    }
  }, [phase.at]);
  const stepLabels = cfg.data?.fee ? ['Reserve', 'Create', 'Record'] : ['Create', 'Record'];
  const visibleIndex = cfg.data?.fee ? stepIndex : Math.max(-1, stepIndex - 1);

  if (phase.at === 'live') {
    const r = phase.record;
    return (
      <section className="launch-done reveal">
        <span className="eyebrow">
          <span className="live-dot" /> live on Base
        </span>
        <Avatar symbol={r.symbol} address={r.token} large />
        <h1>
          ${r.symbol} is live.
        </h1>
        <p>
          {r.name} now trades against {r.stock}c on Uniswap v4. The pool exists, the price is set, and every trade pays you your share of the fee.
        </p>
        <div className="hero-actions" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary btn-lg" to={`/t/${r.token}`}>
            Open the ${r.symbol} trade page →
          </Link>
          <a className="btn btn-ghost btn-lg" href={txUrl(phase.hash)} target="_blank" rel="noreferrer">
            Basescan ↗
          </a>
        </div>
        <div className="launch-share">
          <span className="mono">{`https://squidlor.trade/t/${r.token}`}</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(`https://squidlor.trade/t/${r.token}`);
            }}
          >
            Copy link
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="crumbs">
        <Link to="/">Tokens</Link> / <span>Launch</span>
      </div>
      <div className="launch">
        <section className="launch-form reveal">
          <span className="eyebrow">Squidlor launchpad · Base</span>
          <h1>Launch a token priced in a stock.</h1>
          <p className="dim">
            Name it, pick the stock it trades against, choose where the price starts. The whole supply goes into a Uniswap v4 pool as one-sided
            liquidity; nobody deposits anything, and you are paid a share of every trade.
          </p>

          <label className="fld">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, limits.name))} placeholder="Enzo's Nvidia Fan Club" maxLength={limits.name} disabled={busy} />
            <small>{name.length}/{limits.name}</small>
          </label>
          <label className="fld">
            <span>Ticker</span>
            <div className="fld-prefix">
              <b>$</b>
              <input value={symbol} onChange={(e) => setSymbol(cleanSymbol(e.target.value))} placeholder="ENZO" maxLength={10} disabled={busy} />
            </div>
            <small>1 to 10 letters or digits</small>
          </label>

          <div className="fld">
            <span>Paired with</span>
            <div className="stock-grid">
              {stocks.map((s) => (
                <button key={s.symbol} type="button" className={`stock-opt${s.symbol === chosen?.symbol ? ' on' : ''}`} onClick={() => setStock(s.symbol)} disabled={busy}>
                  <b>{s.tokenSymbol}</b>
                  <span>{s.name}</span>
                </button>
              ))}
              {cfg.isPending ? Array.from({ length: 13 }).map((_, i) => <div key={i} className="stock-opt skeleton" style={{ height: 52 }} />) : null}
            </div>
          </div>

          <div className="fld">
            <span>Opening market cap</span>
            <div className="cap-row">
              {CAP_PRESETS.map((c) => (
                <button key={c} type="button" className={`chip${!customCap && cap === c ? ' on' : ''}`} onClick={() => (setCap(c), setCustomCap(''))} disabled={busy}>
                  {cap$(c)}
                </button>
              ))}
              <div className="cap-custom">
                <b>$</b>
                <input inputMode="numeric" placeholder="custom" value={customCap} onChange={(e) => setCustomCap(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy} />
              </div>
            </div>
            <small className={customCap && !capOk ? 'down' : ''}>
              Between {cap$(limits.startMcUsd.min)} and {cap$(limits.startMcUsd.max)}. This is the first token's price times the supply, not money anyone puts in.
            </small>
          </div>
        </section>

        <aside className="launch-side reveal" style={{ animationDelay: '120ms' }}>
          <div className="ticket preview">
            <div className="ticket-body">
              <div className="ticket-top">
                <span className="eyebrow">preview</span>
                <span className="ticket-chain">Base · 8453</span>
              </div>
              <div className="ticket-id">
                <Avatar symbol={symbol || '??'} address={address ?? '0x0000000000000000000000000000000000000000'} large />
                <div>
                  <div className="ticket-title">{name.trim() || 'Your token'}</div>
                  <div className="ticket-pair">
                    <span className="pair-chip token">${symbol || 'TICKER'}</span>
                    <span className="pair-arrow">⇄</span>
                    <span className="pair-chip stock">{chosen?.tokenSymbol ?? '…'}</span>
                  </div>
                </div>
              </div>
              <div className="ticket-nums">
                <div>
                  <span className="eyebrow">opens at</span>
                  <b>{capOk ? usd(capValue) : '–'}</b>
                </div>
                <div>
                  <span className="eyebrow">first price</span>
                  <b>{openPrice !== undefined ? usd(openPrice, { compact: false }) : '–'}</b>
                </div>
                <div>
                  <span className="eyebrow">supply</span>
                  <b>{amount(supply)}</b>
                </div>
              </div>
              <ul className="launch-facts">
                <li>
                  You earn <b>{(creatorShareBps / 100).toFixed(0)}%</b> of the {cfg.data?.poolFeePercent ?? 1}% fee on every trade, forever.
                </li>
                <li>Priced in {chosen?.tokenSymbol ?? 'the stock'}: if {chosen?.symbol ?? 'the stock'} moves, your token's dollar price moves with it.</li>
                <li>No graduation step. The pool is on Uniswap from the first block.</li>
              </ul>

              {stepLabels.length && visibleIndex >= 0 ? (
                <ol className="steps">
                  {stepLabels.map((l, i) => (
                    <li key={l} className={i < visibleIndex ? 'done' : i === visibleIndex ? 'now' : ''}>
                      <span className="n">{i < visibleIndex ? '✓' : i + 1}</span>
                      <span>
                        {l}
                        {i === visibleIndex
                          ? phase.at === 'reserving' || phase.at === 'creating'
                            ? ' · mining…'
                            : phase.at === 'preparing'
                              ? ' · building the transaction…'
                              : phase.at === 'recording'
                                ? ' · reading the chain…'
                                : ' · confirm in wallet'
                          : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {phase.at === 'error' ? <div className="result err">{phase.message}</div> : null}

              <div style={{ marginTop: 6 }}>
                {!isConnected ? (
                  <ConnectBlock label="Connect wallet to launch" />
                ) : !onBase ? (
                  <button className="btn btn-primary btn-block" onClick={() => void launch()} disabled={switching}>
                    {switching ? 'Switching…' : 'Switch wallet to Base'}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block" onClick={() => void launch(phase.at === 'error' && phase.resume ? phase.resume : phase)} disabled={busy || !formOk || cfg.isPending}>
                    {busy
                      ? stepLabels[Math.max(0, visibleIndex)] === 'Record'
                        ? 'Recording…'
                        : 'Check your wallet…'
                      : phase.at === 'error' && phase.resume
                        ? 'Continue the launch'
                        : !formOk
                          ? 'Fill in the token'
                          : `Launch $${symbol}`}
                  </button>
                )}
              </div>
              <div className="trade-foot">
                You pay network gas on Base. Nothing is deposited into the pool. The token and its pool exist once the create transaction is mined.
              </div>
            </div>
          </div>
          <a className="launch-alt" href={askGeyser(name.trim() && symbol ? `Launch a token called ${name.trim()} with ticker ${symbol} paired with ${chosen?.symbol ?? 'NVDA'}` : `Launch a token paired with ${chosen?.symbol ?? 'NVDA'}`)} target="_blank" rel="noreferrer">
            Prefer to talk it through? Launch with the GEYSER desk in chat ↗
          </a>
        </aside>
      </div>
    </>
  );
}
