import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { deleteImage, putImage, putProfile, type Profile, type TokenOverview } from '../lib/api';
import { useCreatorAuth } from '../lib/auth';
import { TokenLogo } from './TokenLogo';

/**
 * The creator's editor for their token page. Opens only for the wallet that launched the token;
 * the first save asks for one signature (wallet sign-in, valid 30 days), after that saves are
 * plain requests.
 *
 * Images are resized in the browser to a 512px square and re-encoded as WebP (JPEG where WebP is
 * unavailable) before upload, so the server's 400 KB cap is met by construction and nobody uploads
 * a 6 MB photo of their dog by accident.
 */

const IMAGE_PX = 512;

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not an image the browser can read.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_PX;
    canvas.height = IMAGE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the image.');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, IMAGE_PX, IMAGE_PX);
    // Try WebP at descending quality until it fits comfortably under the cap.
    for (const q of [0.9, 0.8, 0.7, 0.55]) {
      const out = canvas.toDataURL('image/webp', q);
      if (out.startsWith('data:image/webp') && out.length * 0.75 < 380 * 1024) return out;
    }
    for (const q of [0.85, 0.7, 0.55]) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (out.length * 0.75 < 380 * 1024) return out;
    }
    throw new Error('Could not compress that image enough. Try a simpler one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Form = Omit<Profile, 'image' | 'updatedAt'>;

export function EditProfile({ overview, onClose }: { overview: TokenOverview; onClose: () => void }) {
  const { token: authToken, signIn, busy: signing } = useCreatorAuth();
  const qc = useQueryClient();
  const p = overview.profile;
  const [form, setForm] = useState<Form>({ tagline: p?.tagline ?? '', description: p?.description ?? '', website: p?.website ?? '', x: p?.x ?? '', telegram: p?.telegram ?? '' });
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [removeImage, setRemoveImage] = useState(false);
  const [state, setState] = useState<{ saving?: boolean; error?: string; ok?: boolean }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await shrink(file);
      setPending(dataUrl);
      setPreview(dataUrl);
      setRemoveImage(false);
      setState({});
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : 'Could not read that image.' });
    }
  };

  const save = async () => {
    setState({ saving: true });
    try {
      const tok = authToken ?? (await signIn());
      await putProfile(overview.token.address, tok, form);
      if (pending) await putImage(overview.token.address, tok, pending);
      else if (removeImage) await deleteImage(overview.token.address, tok);
      await qc.invalidateQueries({ queryKey: ['token'] });
      await qc.invalidateQueries({ queryKey: ['board'] });
      setState({ ok: true });
      setTimeout(onClose, 600);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setState({ error: /user rejected|denied/i.test(m) ? 'Sign-in was cancelled in the wallet.' : m.split('\n')[0] ?? 'Could not save.' });
    }
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const shownImage = removeImage ? undefined : (preview ?? overview.profile?.image ?? overview.token.logo);

  return (
    <div className="modal-bg" onClick={onClose} role="presentation">
      <div className="modal editor" role="dialog" aria-modal="true" aria-labelledby="edit-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">creator tools</span>
            <h2 id="edit-title">Edit ${overview.token.symbol}</h2>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p>What people see on this token's page and on the board. Only your wallet can change it.</p>

        <div className="editor-image">
          <TokenLogo src={shownImage} symbol={overview.token.symbol} address={overview.token.address} size={84} />
          <div className="editor-image-actions">
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={state.saving}>
              {shownImage ? 'Replace image' : 'Add an image'}
            </button>
            {shownImage ? (
              <button className="btn btn-ghost btn-sm" onClick={() => (setRemoveImage(true), setPending(undefined), setPreview(undefined))} disabled={state.saving}>
                Remove
              </button>
            ) : null}
            <small className="faint">Square works best. PNG, JPEG or WebP; resized to 512px in your browser.</small>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>

        <label className="fld">
          <span>Tagline</span>
          <input value={form.tagline} onChange={set('tagline')} maxLength={80} placeholder="One line under the name" />
          <small>{form.tagline.length}/80</small>
        </label>
        <label className="fld">
          <span>Description</span>
          <textarea value={form.description} onChange={set('description')} maxLength={600} rows={4} placeholder="What this token is about, who is behind it, what holders can expect." />
          <small>{form.description.length}/600</small>
        </label>
        <div className="editor-links">
          <label className="fld">
            <span>Website</span>
            <input value={form.website} onChange={set('website')} placeholder="https://" inputMode="url" />
          </label>
          <label className="fld">
            <span>X</span>
            <input value={form.x} onChange={set('x')} placeholder="@handle" />
          </label>
          <label className="fld">
            <span>Telegram</span>
            <input value={form.telegram} onChange={set('telegram')} placeholder="@group" />
          </label>
        </div>

        {state.error ? <div className="notice err">{state.error}</div> : null}
        {state.ok ? <div className="result ok">Saved.</div> : null}
        <div className="editor-actions">
          <span className="faint" style={{ fontSize: 12 }}>{authToken ? 'Signed in as the creator.' : 'Saving asks your wallet for one signature to prove you are the creator.'}</span>
          <button className="btn btn-primary" onClick={() => void save()} disabled={state.saving || signing}>
            {state.saving || signing ? 'Saving…' : authToken ? 'Save' : 'Sign in and save'}
          </button>
        </div>
      </div>
    </div>
  );
}
