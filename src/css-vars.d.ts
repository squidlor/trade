import "react";

/// Lets a `style` prop carry CSS custom properties (`--s`, `--d`) without a
/// cast. React passes them through to `element.style.setProperty` already;
/// only the type was missing.
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
