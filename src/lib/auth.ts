import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { apiUrl, ApiError } from './api';

/**
 * Wallet sign-in against the chat server, for the one thing an address claim cannot authorise:
 * editing a token's page. Nonce, signature, 30-day token, stored per address so switching
 * accounts never inherits a session. Reading anything on this site needs none of this.
 */

const KEY = (addr: string) => `squidlor.trade.auth.${addr.toLowerCase()}`;
type Stored = { token: string; expiresAt: number };

export function readToken(address: string | undefined): string | undefined {
  if (!address) return undefined;
  try {
    const raw = localStorage.getItem(KEY(address));
    if (!raw) return undefined;
    const p = JSON.parse(raw) as Partial<Stored>;
    if (!p.token || !p.expiresAt || p.expiresAt < Date.now() + 60_000) return undefined;
    return p.token;
  } catch {
    return undefined;
  }
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(apiUrl(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(typeof j.message === 'string' ? j.message : `Sign-in failed (${res.status}).`, res.status);
  return j;
}

export function useCreatorAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | undefined>(() => readToken(address));
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(readToken(address)), [address]);

  const signIn = useCallback(async (): Promise<string> => {
    if (!address) throw new Error('Connect a wallet first.');
    setBusy(true);
    try {
      const { nonce, message } = (await post('/api/auth/nonce', { address })) as { nonce: string; message: string };
      const signature = await signMessageAsync({ message });
      const out = (await post('/api/auth/verify', { address, signature, nonce })) as { token: string; expiresAt: string | number };
      const expiresAt = typeof out.expiresAt === 'number' ? out.expiresAt : Date.parse(String(out.expiresAt)) || Date.now() + 29 * 86_400_000;
      try {
        localStorage.setItem(KEY(address), JSON.stringify({ token: out.token, expiresAt } satisfies Stored));
      } catch {
        /* private mode: the token lives for this page only */
      }
      setToken(out.token);
      return out.token;
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  return { token, signIn, busy, address };
}
