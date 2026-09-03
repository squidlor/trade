/**
 * The chat server's launchpad API, typed. These shapes mirror `oracle-chat/server/src/trade-api.ts`
 * and `launchtrade.ts`; the server is the source of truth and this file follows it.
 *
 * Every response is parsed at this boundary (shape-checked, never cast), so a field the server
 * stops sending becomes a thrown error here rather than `undefined` three components deep.
 */

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(apiUrl(path), { ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return body;
}

// ── Tiny parsers ────────────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean => v === true;
const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new ApiError(`Malformed response: missing ${what}.`, 502);
  return v;
};

// ── Board ───────────────────────────────────────────────────────────────────────────────────────

export interface Links {
  basescan: string;
  uniswap: string;
  trade?: string;
}

export interface BoardRow {
  token: string;
  symbol: string;
  name: string;
  stock: string;
  launchedHere: boolean;
  priceUsd?: number;
  mcapUsd?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  change24hPct?: number;
  createdAt?: string;
  dex?: string;
  links: Links;
}

export type BoardScope = 'active' | 'new' | 'squidlor';

export interface Board {
  label: string;
  scope: BoardScope;
  rows: BoardRow[];
  more?: string;
  source: string;
  degraded?: string;
}

const parseLinks = (v: unknown): Links => {
  const r = isRecord(v) ? v : {};
  const trade = str(r.trade);
  return {
    basescan: str(r.basescan) ?? '',
    uniswap: str(r.uniswap) ?? '',
    ...(trade ? { trade } : {}),
  };
};

const optional = <K extends string, T>(key: K, v: T | undefined): Partial<Record<K, T>> =>
  v === undefined ? {} : ({ [key]: v } as Record<K, T>);

function parseRow(v: unknown): BoardRow {
  const r = isRecord(v) ? v : {};
  return {
    token: need(str(r.token), 'row.token'),
    symbol: str(r.symbol) ?? '',
    name: str(r.name) ?? '',
    stock: str(r.stock) ?? '',
    launchedHere: bool(r.launchedHere),
    ...optional('priceUsd', num(r.priceUsd)),
    ...optional('mcapUsd', num(r.mcapUsd)),
    ...optional('volume24hUsd', num(r.volume24hUsd)),
    ...optional('liquidityUsd', num(r.liquidityUsd)),
    ...optional('change24hPct', num(r.change24hPct)),
    ...optional('createdAt', str(r.createdAt)),
    ...optional('dex', str(r.dex)),
    links: parseLinks(r.links),
  };
}

export async function fetchBoard(scope: BoardScope, stock?: string, limit = 30): Promise<Board> {
  const q = new URLSearchParams({ scope, limit: String(limit) });
  if (stock) q.set('stock', stock);
  const b = await getJson(`/api/launchpad/board?${q}`);
  const r = isRecord(b) ? b : {};
  return {
    label: str(r.label) ?? '',
    scope,
    rows: Array.isArray(r.rows) ? r.rows.map(parseRow) : [],
    ...optional('more', str(r.more)),
    source: str(r.source) ?? '',
    ...optional('degraded', str(r.degraded)),
  };
}

// ── Token overview ──────────────────────────────────────────────────────────────────────────────

export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface IndexedPool {
  id: string;
  dex: string;
  tokenSide: 'base' | 'quote';
  priceUsd?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  change24hPct?: number;
  change1hPct?: number;
  buys24h?: number;
  sells24h?: number;
  createdAt?: string;
  mcapUsd?: number;
}

export interface TokenOverview {
  chainId: number;
  token: { address: string; symbol: string; name: string; decimals: number; totalSupply?: number; logo?: string };
  stock: { symbol: string; tokenSymbol: string; name: string; address: string; decimals: number; priceUsd: number; logo?: string };
  launch: {
    source: 'chat' | 'chain' | 'dex';
    launchedHere: boolean;
    creator?: string;
    createdAt?: string;
    txHash?: string;
    blockNumber?: number;
  };
  tradeable: boolean;
  pool?: { id: string; key: PoolKey; feePercent?: number; dynamicFee?: true; tick?: number; liquidity?: string };
  spot?: { priceInStock: number; priceUsd: number; mcapUsd?: number };
  market?: IndexedPool;
  wallet?: { address: string; tokenBalance: string; stockBalance: string };
  candidates?: number;
  pickedBy?: string;
  links: Links;
  unavailableReason?: string;
}

function parseIndexedPool(v: unknown): IndexedPool | undefined {
  if (!isRecord(v)) return undefined;
  const id = str(v.id);
  if (!id) return undefined;
  return {
    id,
    dex: str(v.dex) ?? '',
    tokenSide: v.tokenSide === 'quote' ? 'quote' : 'base',
    ...optional('priceUsd', num(v.priceUsd)),
    ...optional('volume24hUsd', num(v.volume24hUsd)),
    ...optional('liquidityUsd', num(v.liquidityUsd)),
    ...optional('change24hPct', num(v.change24hPct)),
    ...optional('change1hPct', num(v.change1hPct)),
    ...optional('buys24h', num(v.buys24h)),
    ...optional('sells24h', num(v.sells24h)),
    ...optional('createdAt', str(v.createdAt)),
    ...optional('mcapUsd', num(v.mcapUsd)),
  };
}

export async function fetchToken(key: string, wallet?: string): Promise<TokenOverview> {
  const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  const b = await getJson(`/api/launchpad/token/${encodeURIComponent(key)}${q}`);
  const r = isRecord(b) ? b : {};
  const token = isRecord(r.token) ? r.token : {};
  const stock = isRecord(r.stock) ? r.stock : {};
  const launch = isRecord(r.launch) ? r.launch : {};
  const pool = isRecord(r.pool) ? r.pool : undefined;
  const key_ = pool && isRecord(pool.key) ? pool.key : undefined;
  const spot = isRecord(r.spot) ? r.spot : undefined;
  const wallet_ = isRecord(r.wallet) ? r.wallet : undefined;
  const source = launch.source === 'chat' || launch.source === 'dex' ? launch.source : 'chain';
  return {
    chainId: num(r.chainId) ?? 8453,
    token: {
      address: need(str(token.address), 'token.address'),
      symbol: str(token.symbol) ?? '',
      name: str(token.name) ?? '',
      decimals: num(token.decimals) ?? 18,
      ...optional('totalSupply', num(token.totalSupply)),
      ...optional('logo', str(token.logo)),
    },
    stock: {
      symbol: need(str(stock.symbol), 'stock.symbol'),
      tokenSymbol: str(stock.tokenSymbol) ?? `${str(stock.symbol) ?? ''}c`,
      name: str(stock.name) ?? '',
      address: need(str(stock.address), 'stock.address'),
      decimals: num(stock.decimals) ?? 8,
      priceUsd: num(stock.priceUsd) ?? 0,
      ...optional('logo', str(stock.logo)),
    },
    launch: {
      source,
      launchedHere: bool(launch.launchedHere),
      ...optional('creator', str(launch.creator)),
      ...optional('createdAt', str(launch.createdAt)),
      ...optional('txHash', str(launch.txHash)),
      ...optional('blockNumber', num(launch.blockNumber)),
    },
    tradeable: bool(r.tradeable),
    ...(pool && key_
      ? {
          pool: {
            id: str(pool.id) ?? '',
            key: {
              currency0: str(key_.currency0) ?? '',
              currency1: str(key_.currency1) ?? '',
              fee: num(key_.fee) ?? 0,
              tickSpacing: num(key_.tickSpacing) ?? 0,
              hooks: str(key_.hooks) ?? '',
            },
            ...optional('feePercent', num(pool.feePercent)),
            ...(pool.dynamicFee === true ? { dynamicFee: true as const } : {}),
            ...optional('tick', num(pool.tick)),
            ...optional('liquidity', str(pool.liquidity)),
          },
        }
      : {}),
    ...(spot && num(spot.priceUsd) !== undefined
      ? { spot: { priceInStock: num(spot.priceInStock) ?? 0, priceUsd: num(spot.priceUsd) ?? 0, ...optional('mcapUsd', num(spot.mcapUsd)) } }
      : {}),
    ...optional('market', parseIndexedPool(r.market)),
    ...(wallet_ && str(wallet_.address)
      ? { wallet: { address: str(wallet_.address) ?? '', tokenBalance: str(wallet_.tokenBalance) ?? '0', stockBalance: str(wallet_.stockBalance) ?? '0' } }
      : {}),
    ...optional('candidates', num(r.candidates)),
    ...optional('pickedBy', str(r.pickedBy)),
    links: parseLinks(r.links),
    ...optional('unavailableReason', str(r.unavailableReason)),
  };
}

// ── Candles and trades ──────────────────────────────────────────────────────────────────────────

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export async function fetchCandles(key: string, interval: Interval, limit = 300): Promise<{ indexed: boolean; candles: Candle[] }> {
  const b = await getJson(`/api/launchpad/token/${encodeURIComponent(key)}/candles?interval=${interval}&limit=${limit}`);
  const r = isRecord(b) ? b : {};
  const candles: Candle[] = Array.isArray(r.candles)
    ? r.candles.flatMap((c): Candle[] => {
        if (!isRecord(c)) return [];
        const t = num(c.t), o = num(c.o), h = num(c.h), l = num(c.l), cl = num(c.c);
        return t !== undefined && o !== undefined && h !== undefined && l !== undefined && cl !== undefined ? [{ t, o, h, l, c: cl, v: num(c.v) ?? 0 }] : [];
      })
    : [];
  return { indexed: r.pool !== null && r.pool !== undefined, candles };
}

export interface Trade {
  t: number;
  txHash: string;
  wallet: string;
  side: 'buy' | 'sell';
  tokenAmount: number;
  stockAmount: number;
  priceUsd: number;
  volumeUsd: number;
}

export async function fetchTrades(key: string): Promise<{ indexed: boolean; trades: Trade[] }> {
  const b = await getJson(`/api/launchpad/token/${encodeURIComponent(key)}/trades`);
  const r = isRecord(b) ? b : {};
  const trades: Trade[] = Array.isArray(r.trades)
    ? r.trades.flatMap((t): Trade[] => {
        if (!isRecord(t)) return [];
        const at = num(t.t);
        if (at === undefined) return [];
        return [
          {
            t: at,
            txHash: str(t.txHash) ?? '',
            wallet: str(t.wallet) ?? '',
            side: t.side === 'sell' ? 'sell' : 'buy',
            tokenAmount: num(t.tokenAmount) ?? 0,
            stockAmount: num(t.stockAmount) ?? 0,
            priceUsd: num(t.priceUsd) ?? 0,
            volumeUsd: num(t.volumeUsd) ?? 0,
          },
        ];
      })
    : [];
  return { indexed: r.pool !== null && r.pool !== undefined, trades };
}

// ── Quote ───────────────────────────────────────────────────────────────────────────────────────

export type Side = 'buy' | 'sell';
export type BuyUnit = 'usd' | 'stock';
export type SellUnit = 'tokens' | 'all';

export interface QuoteRequest {
  wallet: string;
  token: string;
  side: Side;
  amount: number;
  unit: BuyUnit | SellUnit;
}

export interface TradeStep {
  label: string;
  kind: 'approve-permit2' | 'approve-router' | 'swap';
  transaction: { from: string; to: string; value: string; data: string; gasLimit?: number };
}

export interface Quote {
  side: Side;
  token: { address: string; symbol: string; name: string };
  stock: { symbol: string; tokenSymbol: string; address: string; priceUsd: number };
  amountIn: string;
  amountInUsd?: number;
  expectedOut?: string;
  minOut?: string;
  expectedOutUsd?: number;
  priceUsdPerToken?: number;
  slippageBps: number;
  feePercent?: number;
  dynamicFee?: true;
  steps: TradeStep[];
  unavailableReason?: string;
  needs?: { token: string; amount: string; have: string; getItAt: string };
  /** When the quote was received, so a stale one is re-fetched before it reaches the wallet. */
  at: number;
}

function parseStep(v: unknown): TradeStep {
  const r = isRecord(v) ? v : {};
  const tx = isRecord(r.transaction) ? r.transaction : {};
  const kind = r.kind === 'approve-permit2' || r.kind === 'approve-router' ? r.kind : 'swap';
  return {
    label: str(r.label) ?? kind,
    kind,
    transaction: {
      from: need(str(tx.from), 'step.from'),
      to: need(str(tx.to), 'step.to'),
      value: str(tx.value) ?? '0',
      data: need(str(tx.data), 'step.data'),
      ...optional('gasLimit', num(tx.gasLimit)),
    },
  };
}

export async function postQuote(req: QuoteRequest): Promise<Quote> {
  const b = await getJson('/api/launchpad/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
  const r = isRecord(b) ? b : {};
  const token = isRecord(r.token) ? r.token : {};
  const stock = isRecord(r.stock) ? r.stock : {};
  const needs = isRecord(r.needs) ? r.needs : undefined;
  return {
    side: r.side === 'sell' ? 'sell' : 'buy',
    token: { address: str(token.address) ?? '', symbol: str(token.symbol) ?? '', name: str(token.name) ?? '' },
    stock: { symbol: str(stock.symbol) ?? '', tokenSymbol: str(stock.tokenSymbol) ?? '', address: str(stock.address) ?? '', priceUsd: num(stock.priceUsd) ?? 0 },
    amountIn: str(r.amountIn) ?? '0',
    ...optional('amountInUsd', num(r.amountInUsd)),
    ...optional('expectedOut', str(r.expectedOut)),
    ...optional('minOut', str(r.minOut)),
    ...optional('expectedOutUsd', num(r.expectedOutUsd)),
    ...optional('priceUsdPerToken', num(r.priceUsdPerToken)),
    slippageBps: num(r.slippageBps) ?? 0,
    ...optional('feePercent', num(r.feePercent)),
    ...(r.dynamicFee === true ? { dynamicFee: true as const } : {}),
    steps: Array.isArray(r.steps) ? r.steps.map(parseStep) : [],
    ...optional('unavailableReason', str(r.unavailableReason)),
    ...(needs
      ? { needs: { token: str(needs.token) ?? '', amount: str(needs.amount) ?? '', have: str(needs.have) ?? '', getItAt: str(needs.getItAt) ?? '' } }
      : {}),
    at: Date.now(),
  };
}

// ── Launching ───────────────────────────────────────────────────────────────────────────────────

export interface LaunchConfig {
  stocks: { symbol: string; tokenSymbol: string; name: string; address: string; logo?: string }[];
  defaults: { startMcUsd: number; supplyTokens: number };
  limits: { startMcUsd: { min: number; max: number }; name: number; symbol: number };
  /** null = launching is free. */
  fee: { wei: string; eth: string; treasury: string } | null;
  feeShare: { protocolBps: number; treasuryBps: number };
  poolFeePercent: number;
}

export async function fetchLaunchConfig(): Promise<LaunchConfig> {
  const b = await getJson('/api/launchpad/config');
  const r = isRecord(b) ? b : {};
  const fee = isRecord(r.fee) ? r.fee : undefined;
  const d = isRecord(r.defaults) ? r.defaults : {};
  const l = isRecord(r.limits) ? r.limits : {};
  const mc = isRecord(l.startMcUsd) ? l.startMcUsd : {};
  const fs = isRecord(r.feeShare) ? r.feeShare : {};
  return {
    stocks: Array.isArray(r.stocks)
      ? r.stocks.flatMap((x) => {
          if (!isRecord(x)) return [];
          const symbol = str(x.symbol), address = str(x.address);
          return symbol && address ? [{ symbol, tokenSymbol: str(x.tokenSymbol) ?? `${symbol}c`, name: str(x.name) ?? symbol, address, ...optional('logo', str(x.logo)) }] : [];
        })
      : [],
    defaults: { startMcUsd: num(d.startMcUsd) ?? 4_000, supplyTokens: num(d.supplyTokens) ?? 1_000_000_000 },
    limits: { startMcUsd: { min: num(mc.min) ?? 1_000, max: num(mc.max) ?? 1_000_000 }, name: num(l.name) ?? 32, symbol: num(l.symbol) ?? 10 },
    fee: fee && str(fee.wei) && str(fee.treasury) ? { wei: str(fee.wei) ?? '0', eth: str(fee.eth) ?? '0', treasury: str(fee.treasury) ?? '' } : null,
    feeShare: { protocolBps: num(fs.protocolBps) ?? 500, treasuryBps: num(fs.treasuryBps) ?? 0 },
    poolFeePercent: num(r.poolFeePercent) ?? 1,
  };
}

export interface PreparedLaunch {
  transaction: { from: string; to: string; value: string; data: string; gasLimit?: number };
  token: { address: string; name: string; symbol: string; supplyTokens: number };
  stock: { symbol: string; tokenSymbol: string; address: string; priceUsd: number };
  pool: { feePips: number };
  curves: { startMcUsd: number; endMcUsd: number | 'max'; supplyShare: number }[];
  fees: { beneficiary: string; shareBps: number; role: 'protocol' | 'treasury' | 'creator' }[];
  links: Links;
}

export async function postPrepare(body: { creator: string; name: string; symbol: string; stock: string; startMcUsd?: number; feeTxHash?: string }): Promise<PreparedLaunch> {
  const b = await getJson('/api/launchpad/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const r = isRecord(b) ? b : {};
  const tx = isRecord(r.transaction) ? r.transaction : {};
  const token = isRecord(r.token) ? r.token : {};
  const stock = isRecord(r.stock) ? r.stock : {};
  const pool = isRecord(r.pool) ? r.pool : {};
  return {
    transaction: {
      from: need(str(tx.from), 'transaction.from'),
      to: need(str(tx.to), 'transaction.to'),
      value: str(tx.value) ?? '0',
      data: need(str(tx.data), 'transaction.data'),
      ...optional('gasLimit', num(tx.gasLimit)),
    },
    token: { address: str(token.address) ?? '', name: str(token.name) ?? '', symbol: str(token.symbol) ?? '', supplyTokens: num(token.supplyTokens) ?? 0 },
    stock: { symbol: str(stock.symbol) ?? '', tokenSymbol: str(stock.tokenSymbol) ?? '', address: str(stock.address) ?? '', priceUsd: num(stock.priceUsd) ?? 0 },
    pool: { feePips: num(pool.feePips) ?? 10_000 },
    curves: Array.isArray(r.curves)
      ? r.curves.flatMap((c) => {
          if (!isRecord(c)) return [];
          const start = num(c.startMcUsd), share = num(c.supplyShare);
          if (start === undefined || share === undefined) return [];
          return [{ startMcUsd: start, endMcUsd: c.endMcUsd === 'max' ? ('max' as const) : (num(c.endMcUsd) ?? ('max' as const)), supplyShare: share }];
        })
      : [],
    fees: Array.isArray(r.fees)
      ? r.fees.flatMap((f) => {
          if (!isRecord(f)) return [];
          const role = f.role === 'protocol' || f.role === 'treasury' ? f.role : 'creator';
          return [{ beneficiary: str(f.beneficiary) ?? '', shareBps: num(f.shareBps) ?? 0, role }];
        })
      : [],
    links: parseLinks(r.links),
  };
}

export interface LaunchRecord {
  token: string;
  symbol: string;
  name: string;
  stock: string;
  links: Links;
}

export async function postConfirm(txHash: string, feeTxHash?: string): Promise<LaunchRecord> {
  const b = await getJson('/api/launchpad/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash, ...(feeTxHash ? { feeTxHash } : {}) }) });
  const r = isRecord(b) ? b : {};
  return { token: need(str(r.token), 'token'), symbol: str(r.symbol) ?? '', name: str(r.name) ?? '', stock: str(r.stock) ?? '', links: parseLinks(r.links) };
}
