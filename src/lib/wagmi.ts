import { http, createConfig, fallback } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';

/**
 * One chain. Every pool this page trades is on Base, and a wallet on any other network is asked
 * to switch rather than offered a menu. The transports are used for receipts and reads only:
 * signing always goes through the connected wallet's own provider.
 */
const rpcUrls = (import.meta.env.VITE_BASE_RPC_URLS ?? 'https://base-rpc.publicnode.com,https://mainnet.base.org')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const projectId = (import.meta.env.VITE_WC_PROJECT_ID ?? '').trim();
export const WALLETCONNECT_AVAILABLE = projectId.length > 0;

export const CHAIN = base;

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: 'Squidlor Trade', preference: 'all' }),
    ...(WALLETCONNECT_AVAILABLE
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: 'Squidlor Trade',
              description: 'Trade tokens paired with tokenized stocks on Base',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://trade.squidlor.com',
              icons: ['https://trade.squidlor.com/favicon.svg'],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [base.id]: fallback(rpcUrls.map((u) => http(u, { retryCount: 2 })), { rank: false }),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
