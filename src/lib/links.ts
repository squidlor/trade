/** Where this page sends people: the chat desk, the prediction market, the explorer. */

const strip = (u: string | undefined, fallback: string): string => (u && u.trim() ? u.trim().replace(/\/$/, '') : fallback);

export const CHAT_URL = strip(import.meta.env.VITE_CHAT_URL, 'https://chat.squidlor.com');
export const MARKETS_URL = strip(import.meta.env.VITE_MARKETS_URL, 'https://markets.squidlor.com');
export const BASESCAN = 'https://basescan.org';

/** Open the GEYSER desk with a question already asked. The chat reads `desk` and `ask` on load. */
export const askGeyser = (question: string): string => `${CHAT_URL}/?desk=geyser&ask=${encodeURIComponent(question)}`;

/** Launch a new stock-paired token from the chat, with the stock preselected in the question. */
export const launchOnChat = (stock?: string): string =>
  askGeyser(stock ? `Launch a token paired with ${stock}` : 'Launch a token paired with a stock');

/**
 * The prediction market's create page. Markets settle from an oracle, and there is one for the
 * STOCK, not for a launched token — so the card on a token page offers a market on its stock.
 * `symbol` is a hint the create form may read; the page works without it.
 */
export const createMarket = (stockSymbol: string): string => `${MARKETS_URL}/quest/create?symbol=${encodeURIComponent(stockSymbol)}&ref=trade`;
export const browseMarkets = (): string => `${MARKETS_URL}/markets`;

export const txUrl = (hash: string): string => `${BASESCAN}/tx/${hash}`;
export const addressUrl = (addr: string): string => `${BASESCAN}/address/${addr}`;
export const tokenUrl = (addr: string): string => `${BASESCAN}/token/${addr}`;

/** Where to buy the stock token itself when a wallet has none: Uniswap on Base, output pinned. */
export const buyStockUrl = (stockAddress: string): string => `https://app.uniswap.org/swap?chain=base&outputCurrency=${stockAddress}`;
