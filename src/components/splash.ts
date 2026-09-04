/// Fades out and removes the first-paint splash declared in index.html.
///
/// The splash is plain HTML so it can show before the bundle has downloaded;
/// React never owns it, it only tells it to leave. Idempotent, safe to call
/// from a StrictMode double effect or when there is no splash at all.
///
/// IDENTICAL COPY IN EVERY SQUIDLOR FRONTEND (canonical: dashboard).
export const SPLASH_ID = "splash";

export function hideSplash(): void {
  const el = document.getElementById(SPLASH_ID);
  if (!el || el.classList.contains("is-done")) return;

  el.classList.add("is-done");

  const remove = () => el.remove();
  el.addEventListener("transitionend", remove, { once: true });
  // `transitionend` does not fire in a background tab, and the element must
  // still go away or it would sit over the app with pointer-events off.
  window.setTimeout(remove, 700);
}
