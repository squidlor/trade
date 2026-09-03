import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi';
import { short } from '../lib/format';

/**
 * Wallet connect, in the page's own dress rather than a vendor modal. wagmi supplies the
 * connectors; this only lists them. The connected state is a pill with the address and a
 * disconnect, and nothing here asks for a signature: reading a board needs no proof of anything,
 * and the trade panel gets the address from wagmi when it is time to sign.
 */

const glyph = (c: Connector): string => {
  const id = c.id.toLowerCase();
  if (id.includes('coinbase')) return '◍';
  if (id.includes('walletconnect')) return '◎';
  if (id.includes('metamask')) return '🦊';
  if (id.includes('rabby')) return '🐰';
  if (id.includes('phantom')) return '👻';
  return '👛';
};

/** Wallet errors are written for developers. The one or two people hit most get a human line. */
const friendly = (m: string): string => {
  if (/user rejected|user denied|rejected the request|closed/i.test(m)) return 'Cancelled in the wallet.';
  if (/could not resolve|failed to fetch dynamically|import/i.test(m)) return 'That wallet option failed to load. Reload the page and try again.';
  if (/already pending|resource unavailable/i.test(m)) return 'Your wallet already has a request open. Finish it there first.';
  return m.split('\n')[0]?.slice(0, 160) ?? 'Could not connect.';
};

const hint = (c: Connector): string => {
  const id = c.id.toLowerCase();
  if (id.includes('coinbase')) return 'Coinbase Wallet app, extension or Smart Wallet';
  if (id.includes('walletconnect')) return 'Scan with any mobile wallet';
  if (c.type === 'injected') return 'Browser extension';
  return c.type;
};

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connectors, connect, isPending, variables, error } = useConnect();
  const { isConnected } = useAccount();
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // wagmi lists a generic "Injected" entry plus one per detected EIP-6963 wallet; hide the
  // generic one when a named wallet was found, so the list is wallets, not a plumbing term.
  const named = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected');
  const list = connectors.filter((c) => !(c.id === 'injected' && named.length > 0));

  return (
    <div className="modal-bg" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Base · 8453</span>
            <h2 id="connect-title">Connect a wallet</h2>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p>Nothing is signed by connecting. Your wallet asks before any trade.</p>
        <div className="wallets">
          {list.map((c) => {
            const busy = isPending && variables?.connector === c;
            return (
              <button key={c.uid} className={`wallet-btn${busy ? ' busy' : ''}`} onClick={() => connect({ connector: c })} disabled={isPending}>
                {/* EIP-6963 wallets announce their own icon; the SDK connectors get a drawn one. */}
                <span className="wallet-ico">{c.icon ? <img src={c.icon} alt="" width={22} height={22} /> : <span aria-hidden="true">{glyph(c)}</span>}</span>
                <span className="wallet-txt">
                  <b>{c.name}</b>
                  <span>{busy ? 'Check your wallet…' : hint(c)}</span>
                </span>
                <span className="wallet-go" aria-hidden="true">{busy ? '…' : '→'}</span>
              </button>
            );
          })}
          {list.length === 0 ? <div className="dim">No wallet found. Install a browser wallet or use the Coinbase Wallet app.</div> : null}
        </div>
        {error ? (
          <div className="notice err" style={{ marginTop: 12, marginBottom: 0 }}>
            {friendly(error.message)}
          </div>
        ) : null}
        <div className="modal-foot">New to wallets? Coinbase Wallet creates one in a minute, no extension needed.</div>
      </div>
    </div>
  );
}

export function ConnectButton() {
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  if (isConnected && address) {
    return (
      <span className="acct" title={`${address} via ${connector?.name ?? 'wallet'}`}>
        <span className="ring" />
        {short(address)}
        <button onClick={() => disconnect()} aria-label="Disconnect wallet">
          ✕
        </button>
      </span>
    );
  }
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      {open ? <ConnectModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Used by the trade panel: a full-width connect that opens the same modal. */
export function ConnectBlock({ label = 'Connect wallet to trade' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? <ConnectModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
