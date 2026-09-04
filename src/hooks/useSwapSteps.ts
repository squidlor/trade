import { useCallback, useEffect, useRef, useState } from 'react';
import { isAddress, isHex, type Address } from 'viem';
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { ApiError, type TradeStep } from '../lib/api';
import { CHAIN } from '../lib/wagmi';

/**
 * The one signing loop for every trade on this site: a launched token against its stock, or the
 * stock itself against ETH/USDC. Both quotes come back as ordered `steps` of exact calldata, and
 * the loop does the same thing to either: ask for a quote when the inputs settle, hand each step
 * to the wallet in order, wait for the receipt between them, stop where the wallet stops, resume
 * from the failed step on retry. Approvals that landed stay landed.
 *
 * A quote older than STALE_MS is re-fetched at the moment of signing so the wallet never sees a
 * number the pool has moved away from. Nothing here builds calldata; it asks, shows, and relays.
 */

const STALE_MS = 30_000;
const DEBOUNCE_MS = 450;

export interface Signable {
  steps: TradeStep[];
  /** When the quote was received. */
  at: number;
}

export type Phase<Q extends Signable> =
  | { at: 'idle' }
  | { at: 'quoting' }
  | { at: 'ready'; quote: Q }
  | { at: 'signing'; quote: Q; step: number; hashes: string[]; mining?: string }
  | { at: 'done'; quote: Q; hashes: string[] }
  | { at: 'error'; message: string; quote?: Q; step?: number; hashes?: string[] };

export const firstLine = (e: unknown): string => {
  if (e instanceof ApiError) return e.message;
  const r = e as { shortMessage?: string; message?: string } | undefined;
  const m = r?.shortMessage ?? r?.message ?? String(e);
  if (/user rejected|user denied|rejected the request/i.test(m)) return 'Rejected in the wallet. Nothing was sent.';
  return m.split('\n')[0]?.slice(0, 180) ?? 'Something went wrong.';
};

export function useSwapSteps<Q extends Signable>(opts: {
  /** Memoize this: a new function identity re-quotes. */
  getQuote: (wallet: Address) => Promise<Q>;
  /** Inputs are valid and the thing is tradeable; false parks the loop at idle. */
  enabled: boolean;
  /** After every step mined: clear the form, refresh what the trade changed. */
  onDone?: () => void;
  /** After a step reverted on-chain (balances may have moved anyway). */
  onReverted?: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const [phase, setPhase] = useState<Phase<Q>>({ at: 'idle' });
  const reqId = useRef(0);
  const onBase = chainId === CHAIN.id;
  const { getQuote, enabled, onDone, onReverted } = opts;

  // Re-quote whenever the inputs settle. Stale responses are dropped by id.
  useEffect(() => {
    if (!isConnected || !address || !enabled) {
      setPhase((p) => (p.at === 'signing' || p.at === 'done' || p.at === 'error' ? p : { at: 'idle' }));
      return;
    }
    const id = ++reqId.current;
    setPhase((p) => (p.at === 'signing' ? p : { at: 'quoting' }));
    const t = setTimeout(async () => {
      try {
        const quote = await getQuote(address);
        if (reqId.current === id) setPhase({ at: 'ready', quote });
      } catch (e) {
        if (reqId.current === id) setPhase({ at: 'error', message: firstLine(e) });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [isConnected, address, enabled, getQuote]);

  const runSteps = useCallback(
    async (quote: Q, from: number, hashes: string[]) => {
      if (!publicClient) throw new Error('No RPC client for Base.');
      for (let i = from; i < quote.steps.length; i++) {
        const step: TradeStep | undefined = quote.steps[i];
        if (!step) break;
        const { to, data, value, gasLimit } = step.transaction;
        if (!isAddress(to) || !isHex(data)) throw new Error(`Step ${i + 1} is malformed.`);
        setPhase({ at: 'signing', quote, step: i, hashes: [...hashes] });
        let hash: `0x${string}`;
        try {
          hash = await sendTransactionAsync({
            to,
            data,
            value: BigInt(value || '0'),
            chainId: CHAIN.id,
            ...(gasLimit ? { gas: BigInt(gasLimit) } : {}),
          });
        } catch (e) {
          setPhase({ at: 'error', message: `${step.label}: ${firstLine(e)}`, quote, step: i, hashes: [...hashes] });
          return;
        }
        hashes.push(hash);
        setPhase({ at: 'signing', quote, step: i, hashes: [...hashes], mining: hash });
        const rc = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
        if (rc.status === 'reverted') {
          setPhase({ at: 'error', message: `${step.label} reverted on-chain. Nothing after it was sent.`, quote, step: i, hashes: [...hashes] });
          onReverted?.();
          return;
        }
      }
      setPhase({ at: 'done', quote, hashes: [...hashes] });
      onDone?.();
    },
    [publicClient, sendTransactionAsync, onDone, onReverted],
  );

  /** The button: switch chain if needed, refresh a stale quote, then run (or resume) the steps. */
  const go = useCallback(async () => {
    if (!address) return;
    if (!onBase) {
      try {
        await switchChainAsync({ chainId: CHAIN.id });
      } catch (e) {
        setPhase({ at: 'error', message: firstLine(e) });
      }
      return;
    }
    let quote: Q | undefined = phase.at === 'ready' ? phase.quote : phase.at === 'error' ? phase.quote : undefined;
    let resume = phase.at === 'error' && phase.quote && phase.step !== undefined ? { step: phase.step, hashes: phase.hashes ?? [] } : undefined;
    try {
      /**
       * A stale quote is re-fetched even on a retry. The failed run's calldata is bound to the
       * prices of its own block, and a retry minutes later would sign it unchanged; a fresh quote
       * starts from step 0 but omits any approval that already landed, because the server reads
       * the allowance from the chain. So the retry loses nothing and signs current numbers.
       */
      if (!quote || Date.now() - quote.at > STALE_MS) {
        setPhase({ at: 'quoting' });
        quote = await getQuote(address);
        resume = undefined;
        if (quote.steps.length === 0) {
          setPhase({ at: 'ready', quote });
          return;
        }
      }
      await runSteps(quote, resume?.step ?? 0, resume?.hashes ?? []);
    } catch (e) {
      setPhase({ at: 'error', message: firstLine(e), ...(quote ? { quote } : {}) });
    }
  }, [address, onBase, phase, switchChainAsync, getQuote, runSteps]);

  const quote: Q | undefined = phase.at === 'ready' || phase.at === 'signing' || phase.at === 'done' ? phase.quote : phase.at === 'error' ? phase.quote : undefined;
  const busy = phase.at === 'quoting' || phase.at === 'signing' || switching;
  /** True while a failed run can be picked up from its failed step. */
  const resumable = phase.at === 'error' && phase.quote !== undefined && phase.step !== undefined;

  return { phase, quote, busy, resumable, go, address, isConnected, onBase, switching };
}
