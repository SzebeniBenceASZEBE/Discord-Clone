import type { ReactNode } from 'react';
import { theme } from '../theme.ts';

/** Centers a dark card on the app background — used by Login and Register. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.chatBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, background: theme.sidebar, borderRadius: 8, padding: 26 }}>
        {children}
      </div>
    </div>
  );
}
