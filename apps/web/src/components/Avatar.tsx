import type { PresenceStatus } from '@dc/shared';
import { theme } from '../theme.ts';

// Initials avatar with a deterministic color (until real avatar uploads exist).
const COLORS = ['#5865f2', '#23a55a', '#eb459e', '#f0b232', '#3ba55c', '#9b59b6', '#e67e22', '#11806a'];

export const statusColor: Record<PresenceStatus, string> = {
  online: '#23a55a',
  idle: '#f0b232',
  dnd: '#f23f43',
  offline: '#80848e',
};

function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export function Avatar({
  name,
  id,
  size = 40,
  status,
  ringColor = theme.sidebar,
}: {
  name: string;
  id: string;
  size?: number;
  status?: PresenceStatus;
  /** Background the status dot's ring blends into. */
  ringColor?: string;
}) {
  const dot = Math.max(10, Math.round(size * 0.3));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: colorFor(id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: Math.round(size * 0.42), fontWeight: 600 }}>
        {name.charAt(0).toUpperCase()}
      </div>
      {status && (
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: dot, height: dot, borderRadius: '50%', background: statusColor[status], border: `3px solid ${ringColor}` }} />
      )}
    </div>
  );
}
