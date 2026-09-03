import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAIN } from '../lib/wagmi';
import { CHAT_URL, MARKETS_URL } from '../lib/links';
import { ConnectButton } from './Connect';

/**
 * The network pill: Base when the wallet is on Base, an amber warning with a one-click switch
 * when it is not. Shown only while connected; nothing to say before that.
 */
function ChainPill() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected) return null;
  const ok = chainId === CHAIN.id;
  return (
    <button
      className={`chain-pill${ok ? '' : ' wrong'}`}
      onClick={() => (ok ? undefined : switchChain({ chainId: CHAIN.id }))}
      title={ok ? 'Connected to Base' : 'Switch your wallet to Base'}
      disabled={ok || isPending}
    >
      <span className="dot" />
      <span className="lbl">{ok ? 'Base' : isPending ? 'switching…' : 'switch to Base'}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand" aria-label="Squidlor Trade home">
            {/* The deck's mark, same file the chat uses: a transparent PNG that needs no tile behind it. */}
            <img className="brand-mark" src="/squidlor-mark.png" alt="" width={32} height={32} />
            <span className="brand-text">
              <span className="brand-name">Squidlor</span>
              <span className="brand-sub">Trade</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/" end>
              Tokens
            </NavLink>
            <a className="ext" href={`${CHAT_URL}/?desk=geyser`} target="_blank" rel="noreferrer">
              Launch
            </a>
            <a className="ext" href={MARKETS_URL} target="_blank" rel="noreferrer">
              Predict
            </a>
          </nav>
          <div className="topbar-right">
            <ChainPill />
            <ConnectButton />
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <div className="footer-in">
          <span>Squidlor · tokens paired with tokenized stocks, on Base</span>
          <a href={CHAT_URL} target="_blank" rel="noreferrer">
            Oracle chat
          </a>
          <a href={MARKETS_URL} target="_blank" rel="noreferrer">
            Prediction markets
          </a>
          <a href="https://docs.squidlor.com" target="_blank" rel="noreferrer">
            Docs
          </a>
          <span style={{ marginLeft: 'auto' }}>
            Prices are DEX pool prints and on-chain reads, not oracle quotes. Trading tokens this new can lose all of what you put in.
          </span>
        </div>
      </footer>
    </div>
  );
}
