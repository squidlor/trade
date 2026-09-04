# Squidlor Trade

squidlor.trade. Buy and sell tokens that are paired with tokenized US stocks (Coinbase's
NVDAc, TSLAc, AAPLc, …) on Base. This is the page the GEYSER desk on chat.squidlor.com sends
people to after a launch.

## What it is

A static single-page app. It has no backend of its own: every read and every quote comes from
the oracle-chat server's `/api/launchpad/*` routes, which nginx proxies on the same origin.
Signing happens in the visitor's wallet; the page hands over unsigned transactions in order.

| Route | What |
|---|---|
| `/` | Home: the stock tiles, trending on Base, then the board of Squidlor launches. |
| `/stocks` | The thirteen tokenized stocks: price, 24h, Chainlink reference, volume, liquidity, venue. |
| `/s/<ticker>` | One stock (`/s/NVDA`): chart, buy/sell for ETH or USDC, launches paired with it, prediction card. |
| `/t/<address or symbol>` | One launched token: chart, spot price, trades, buy/sell panel, prediction-market card. |
| `/launch`, `/me` | Launch a stock-paired token; the creator's dashboard. |

## Buying the stock itself

`/s/NVDA` swaps ETH or USDC into the B20 stock token through `POST /api/launchpad/stocks/quote`.
The server asks KyberSwap's aggregator for the route (Aerodrome Slipstream holds most of the
liquidity), builds the transaction, simulates it from the wallet with `eth_simulateV1`, and returns
the same `steps` shape as a launch quote: an ERC-20 approval when needed, then the swap. Squidlor's
fee (0.1% by default, `KYBER_FEE_BPS` on the server) is collected by Kyber's router in the same
transaction and is already out of the numbers shown. Both trade panels run through one signing
loop, `src/hooks/useSwapSteps.ts`.

Coinbase's tokenized stocks are Regulation S and not for US persons; the token's on-chain transfer
policy can block a wallet, which the simulated quote reports before anything is sent. The page shows
that notice on every stock surface.

The trending section reads `GET /api/dex/trending` (GeckoTerminal's trending pools on Base, folded
to tokens). Those rows link out to the pool; they are not Squidlor launches and get no quote.

## How a trade works

1. The page asks `POST /api/launchpad/quote` with the wallet, token, side and amount.
2. The server simulates the exact Uniswap v4 swap (Universal Router, Doppler-hooked pool) with
   `eth_simulateV1` from that wallet and returns one to three unsigned steps: approve Permit2,
   approve the router, swap. Approvals are included only when missing.
3. The page sends each step through the connected wallet and waits for its receipt before the
   next. A quote older than 30 s is refreshed before the first signature.

Buys are paid in the stock token (NVDAc for an NVDA-paired token), never in ETH. When the wallet
has none, the quote says so and the panel links to where to get it.

Prices come from two places and the page says which: the pool's own `slot0` on-chain (exists from
the launch block, so a token with zero trades still has a price) and GeckoTerminal's DEX index
(candles, volume, recent trades; appears after the first trade).

## Develop

```sh
npm install
npm run dev          # http://localhost:5040, /api proxied to https://chat.squidlor.com
TRADE_API_ORIGIN=http://localhost:5030 npm run dev   # against a local oracle-chat server
npm test             # pure helpers
npm run build        # tsc -b && vite build → dist/
```

Environment is in `.env.production` (committed: nothing in it is secret, and a build without it
silently targets the wrong place). See `.env.example` for each key.

## Deploy

`scripts/deploy-trade.sh` in the squidlor workspace builds here, ships `dist/` to
`/opt/trade/dist` on the prod box and installs `deploy/nginx-trade.conf.example` as the vhost.
DNS (Cloudflare, by hand) and `certbot --nginx -d squidlor.trade` come after the first ship.

## Design

Same tokens as the chat: blue-violet `#7B4DFF`, Alexandria / Outfit / IBM Plex Mono, dark only.
Charts are lightweight-charts; wallets are wagmi (injected, Coinbase Wallet, WalletConnect).
