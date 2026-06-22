import type { CSSProperties } from 'react';

// Shared styling for the login/register cards, matching the mockup palette.
export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: '#949ba4',
  margin: '14px 0 6px',
  fontWeight: 500,
};

export const hintStyle: CSSProperties = { fontSize: 11, color: '#80848e', marginTop: 5 };

export const buttonStyle: CSSProperties = {
  width: '100%',
  background: '#5865f2',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: 11,
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  marginTop: 18,
};

export const errorStyle: CSSProperties = {
  background: '#3a2326',
  color: '#f0888c',
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 4,
  marginTop: 14,
};
