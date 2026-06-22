import { theme, layout } from '../theme.ts';

export function ActiveNow() {
  return (
    <aside
      style={{
        width: layout.activeNowWidth,
        flex: 'none',
        background: theme.panel,
        borderLeft: `1px solid rgba(0,0,0,.2)`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Active Now</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: theme.textMuted }}>
        It&rsquo;s quiet for now. When friends start talking or sharing screens, it&rsquo;ll show up here.
      </div>
    </aside>
  );
}
