import { useEffect, useState } from 'react';

/**
 * True while the viewport is phone-width. Drives the mobile drawer layout in
 * AppShell; at or above the breakpoint the app keeps its multi-column desktop
 * layout. Uses matchMedia so it reacts to resize / rotation cheaply.
 */
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isMobile;
}
