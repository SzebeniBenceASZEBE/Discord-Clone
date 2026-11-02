/**
 * Color + layout tokens lifted from the original design mockup
 * (docs/design/chat-app-mockup.html). Keeping them in one place so the rebuilt
 * components stay faithful to the intended look as we add screens.
 */
export const theme = {
  rail: '#1e1f22',
  sidebar: '#2b2d31',
  chatBg: '#313338',
  panel: '#2b2d31',
  text: '#dbdee1',
  textMuted: '#949ba4',
  blurple: '#5865f2',
  blurpleHover: '#4752c4',
  green: '#23a55a',
  red: '#da373c',
  redHover: '#a12829',
  divider: '#2d2f32',
  hover: '#35373c',
} as const;

export const layout = {
  railWidth: 72,
  sidebarWidth: 240,
  activeNowWidth: 340,
  topBarHeight: 48,
} as const;
