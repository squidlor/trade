import { useEffect, useId, type JSX } from "react";
import { hideSplash } from "./splash";

/// The Squidlor mark as a loading indicator: the head ring is the spinner,
/// the tentacles sway. Styled by squid-loader.css, the same rules that drive
/// the pre-bundle splash in index.html; the geometry there and here must stay
/// identical so the hand-off between the two is invisible.
///
/// IDENTICAL COPY IN EVERY SQUIDLOR FRONTEND (canonical: dashboard). No
/// Tailwind, no helper libraries, so it drops into any of them unchanged.
/// Geometry is the shared deck mark (dashboard/src/layouts/header/logo.tsx).

interface SquidMarkProps {
  /** Rendered height in px. Width follows the 33:36 viewBox. */
  size: number;
}

const SquidMark = ({ size }: SquidMarkProps) => {
  // Gradient ids must be unique per instance or two loaders on one page
  // would share (and the second would lose) their fills.
  const uid = useId();
  const bodyId = `squid-body-${uid}`;
  const arcId = `squid-arc-${uid}`;
  const width = Math.round((size * 33) / 36);

  return (
    <div className="squid-loader" style={{ width, height: size }}>
      <div className="squid-loader__glow" />
      <svg
        className="squid-loader__mark"
        width={width}
        height={size}
        viewBox="0 0 33 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={bodyId} gradientUnits="userSpaceOnUse" x1="16" y1="20" x2="16" y2="34">
            <stop offset="0" stopColor="#9B7BFF" />
            <stop offset="1" stopColor="#6A3DF0" />
          </linearGradient>
          <linearGradient id={arcId} gradientUnits="userSpaceOnUse" x1="8" y1="2" x2="24" y2="22">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#7B4DFF" />
          </linearGradient>
        </defs>
        <ellipse className="squid-loader__ring" cx="15.864" cy="12.303" rx="7.361" ry="9.726" strokeWidth="5.155" />
        <ellipse
          className="squid-loader__arc"
          cx="15.864"
          cy="12.303"
          rx="7.361"
          ry="9.726"
          strokeWidth="5.155"
          pathLength="100"
          stroke={`url(#${arcId})`}
        />
        {ARMS.map((arm) => (
          <path
            key={arm.d}
            className="squid-loader__arm"
            d={arm.d}
            stroke={`url(#${bodyId})`}
            strokeWidth="4.305"
            style={{ transformOrigin: arm.origin, "--s": arm.side, "--d": arm.delay }}
          />
        ))}
      </svg>
    </div>
  );
};

/// Each tentacle swings about its own root, so `origin` is where it meets the
/// head (viewBox units). `side` flips the swing so mirrored arms move apart,
/// `delay` staggers the pairs from the centre outwards.
const ARMS = [
  { d: "M16.1836 24.8726L16.1836 33.3369", origin: "16.18px 24.87px", side: 1, delay: "0s" },
  { d: "M10.2305 20.4082C9.92045 22.2814 7.87077 25.77 2.15221 24.7389", origin: "10.23px 20.41px", side: 1, delay: "-0.3s" },
  { d: "M22.1348 20.4082C22.4448 22.2814 24.4945 25.77 30.213 24.7389", origin: "22.13px 20.41px", side: -1, delay: "-0.3s" },
  { d: "M13.2598 23.5969C12.9497 25.4701 9.25253 33.1846 3.53397 32.1535", origin: "13.26px 23.6px", side: 1, delay: "-0.6s" },
  { d: "M19.1055 23.5969C19.4155 25.4701 23.1127 33.1846 28.8313 32.1535", origin: "19.11px 23.6px", side: -1, delay: "-0.6s" },
] as const;

interface BrandLoaderProps {
  /** Height of the mark in px. */
  size?: number;
  caption?: string;
  className?: string;
}

/** In-page loader: the mark with an optional caption under it. */
export const BrandLoader = ({ size = 56, caption, className }: BrandLoaderProps): JSX.Element => (
  <div
    className={className ? `squid-inline ${className}` : "squid-inline"}
    role="status"
    aria-live="polite"
    aria-label={caption ?? "Loading"}
  >
    <SquidMark size={size} />
    {caption ? <p className="squid-inline__caption">{caption}</p> : null}
  </div>
);

/**
 * Full-viewport loader, matching the index.html splash pixel for pixel. Render
 * it from a boot gate (a session check) so that, on first load, it sits under
 * the identical HTML splash and nothing jumps when that fades.
 */
export const BrandSplash = ({ caption = "Loading" }: { caption?: string }): JSX.Element => (
  <div className="squid-splash" role="status" aria-live="polite" aria-label="Loading Squidlor">
    <div className="squid-splash__stack">
      <SquidMark size={104} />
      <div className="squid-splash__text">
        <div className="squid-splash__word">Squidlor</div>
        <div className="squid-splash__caption">{caption}</div>
      </div>
    </div>
  </div>
);

/// Drop this anywhere in the tree of an app that has no blocking boot gate:
/// once React has committed its first frame, the index.html splash fades out.
/// Apps with a gate (a session check) call hideSplash() when it resolves.
export const SplashDismiss = (): null => {
  useEffect((): void => {
    hideSplash();
  }, []);
  return null;
};

export default BrandLoader;
