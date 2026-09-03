import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { isAddress, isHex } from 'viem';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { ConnectBlock } from '../components/Connect';
import { TokenLogo } from '../components/TokenLogo';
import { ApiError, fetchCreator, type CreatorLaunch } from '../lib/api';
import { ago, amount, usd } from '../lib/format';
import { txUrl } from '../lib/links';
import { CHAIN } from '../lib/wagmi';

/**
 * Your launches and what they have paid you. Claimable amounts come from simulating the fee
 * manager's `collectFees` from your address, so the number shown is the number the claim pays.
 * The Claim button sends that same call; the fee manager pays the caller's share in both pool
 * currencies (the stock token and your token).
 */

const firstLine = (e: unknown): string => {
  if (e instanceof ApiError) return e.message;
  const r = e as { shortMessage?: string; message?: string } | undefined;
  const m = r?.shortMessage ?? r?.message ?? String(e);
  if (/user rejected|user denied|rejected the request/i.test(m)) return 'Rejected in the wallet.';
  return m.split('\n')[0]?.slice(0, 160) ?? 'Something went wrong.';
};

function LaunchCard({ l, onClaimed }: { l: CreatorLaunch; onClaimed: () => void }) {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const [state, setState] = useState<{ busy?: boolean; hash?: string; error?: string; done?: boolean }>({});
  const has = !!l.claimable && (Number(l.claimable.stock) > 0 || Number(l.claimable.token) > 0);

  const claim = async () => {
    setState({ busy: true });
    try {
      if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
      if (!isAddress(l.claim.to) || !isHex(l.claim.data)) throw new Error('Malformed claim transaction.');
      const hash = await sendTransactionAsync({ to: l.claim.to, data: l.claim.data, chainId: CHAIN.id, ...(l.claim.gasLimit ? { gas: BigInt(l.claim.gasLimit) } : {}) });
      setState({ busy: true, hash });
      const rc = await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
      if (rc?.status === 'reverted') throw new Error('The claim reverted on-chain.');
      setState({ hash, done: true });
      onClaimed();
    } catch (e) {
      setState({ error: firstLine(e) });
    }
  };

  return (
    <div className="card claim-card">
      <div className="claim-head">
        <Link to={`/t/${l.token.address}`} className="tok">
          <TokenLogo src={l.token.logo} symbol={l.token.symbol} address={l.token.address} />
          <div className="tok-name">
            <b>${l.token.symbol}</b>
            <span>{l.token.name} · paired with {l.stock.tokenSymbol} · {ago(l.createdAt)} ago</span>
          </div>
        </Link>
        <span className="tag">your share {l.sharePercent}%</span>
      </div>
      <div className="claim-grid">
        <div>
          <span className="eyebrow">market cap</span>
          <b className="mono">{usd(l.spot?.mcapUsd)}</b>
        </div>
        <div>
          <span className="eyebrow">claimable {l.stock.tokenSymbol}</span>
          <b className="mono">{l.claimable ? amount(l.claimable.stock, 6) : '–'}</b>
        </div>
        <div>
          <span className="eyebrow">claimable ${l.token.symbol}</span>
          <b className="mono">{l.claimable ? amount(l.claimable.token) : '–'}</b>
        </div>
        <div>
          <span className="eyebrow">value</span>
          <b className={`mono${has ? ' up' : ''}`}>{l.claimable ? usd(l.claimable.usd, { compact: false }) : '–'}</b>
        </div>
      </div>
      {l.claimError ? <div className="notice err">{l.claimError}</div> : null}
      {state.error ? <div className="result err">{state.error}</div> : null}
      {state.done && state.hash ? (
        <div className="result ok">
          Claimed.{' '}
          <a href={txUrl(state.hash)} target="_blank" rel="noreferrer">
            Basescan ↗
          </a>
        </div>
      ) : null}
      <div className="claim-actions">
        <button className="btn btn-primary" onClick={() => void claim()} disabled={state.busy || !has || !!l.claimError}>
          {state.busy ? (state.hash ? 'Mining…' : 'Confirm in wallet…') : has ? `Claim ${usd(l.claimable?.usd, { compact: false })}` : 'Nothing to claim yet'}
        </button>
        <Link className="btn btn-ghost" to={`/t/${l.token.address}?edit=1`}>
          Edit page
        </Link>
        <Link className="btn btn-ghost" to={`/t/${l.token.address}`}>
          Trade
        </Link>
      </div>
      <div className="claim-split">
        {l.beneficiaries.map((b) => (
          <span key={b.address} className={`pill ${b.role === 'you' ? 'up' : 'flat'}`}>
            {b.role === 'you' ? 'you' : b.role === 'treasury' ? 'Squidlor' : b.role === 'protocol' ? 'Doppler' : b.address.slice(0, 6)} {b.sharePercent}%
          </span>
        ))}
        <span className="faint">of the 1% fee on every trade</span>
      </div>
    </div>
  );
}

export function CreatorPage() {
  const { address, isConnected } = useAccount();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['creator', address ?? ''], queryFn: () => fetchCreator(address ?? ''), enabled: !!address, refetchInterval: 60_000 });
  useEffect(() => {
    document.title = 'My launches · Squidlor Trade';
  }, []);
  const d = q.data;

  return (
    <>
      <div className="crumbs">
        <Link to="/">Tokens</Link> / <span>My launches</span>
      </div>
      <section className="creator-head reveal">
        <div>
          <span className="eyebrow">creator dashboard</span>
          <h1>{d?.isTreasury ? 'Squidlor treasury' : 'Your launches'}</h1>
          <p className="dim">
            {d?.isTreasury
              ? 'Every Squidlor launch pays the treasury a share of its trading fees. This is what has accrued and what a claim pays now.'
              : 'Every token you launched, what it is worth, and the trading fees waiting for you. Fees are paid in the stock token and in your token.'}
          </p>
        </div>
        <div className="ledger" style={{ margin: 0, maxWidth: 360 }}>
          <div>
            <dt>launches</dt>
            <dd className={q.isPending && isConnected ? 'skeleton' : ''}>{d?.totals.launches ?? '–'}</dd>
          </div>
          <div>
            <dt>claimable now</dt>
            <dd className={q.isPending && isConnected ? 'skeleton' : d && d.totals.claimableUsd > 0 ? 'up' : ''}>{d ? usd(d.totals.claimableUsd, { compact: false }) : '–'}</dd>
          </div>
        </div>
      </section>

      {!isConnected ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <p className="dim" style={{ marginTop: 0 }}>
            Connect the wallet you launched with to see your tokens and claim fees.
          </p>
          <ConnectBlock label="Connect wallet" />
        </div>
      ) : q.isPending ? (
        <div className="card skeleton" style={{ height: 160 }} />
      ) : q.isError ? (
        <div className="notice err">{q.error.message}</div>
      ) : d && d.launches.length === 0 ? (
        <div className="card empty">
          This wallet has not launched anything on Squidlor yet.{' '}
          <Link to="/launch">Launch a token</Link>.
        </div>
      ) : (
        <div className="claim-list">{d?.launches.map((l) => <LaunchCard key={l.token.address} l={l} onClaimed={() => void qc.invalidateQueries({ queryKey: ['creator'] })} />)}</div>
      )}
      <p className="faint" style={{ fontSize: 12, marginTop: 18 }}>
        Claimable amounts are the result of simulating the fee manager's collect call from your wallet on the current block. Anyone can trigger a collect; only the beneficiary is paid their share.
      </p>
    </>
  );
}
