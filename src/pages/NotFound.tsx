import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="empty" style={{ paddingTop: 80 }}>
      <span className="eyebrow">404</span>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '10px 0' }}>Nothing trades here.</h1>
      <p className="dim">
        Token pages live at <span className="mono">/t/&lt;address or symbol&gt;</span>.
      </p>
      <Link className="btn" to="/">
        Back to the board
      </Link>
    </div>
  );
}
