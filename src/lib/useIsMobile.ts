import { useEffect, useState } from 'react';

// Single source of truth for "are we on a phone-sized surface". Drives which
// app SHELL renders (bottom-nav mobile reader vs. desktop tab workshop), not
// just CSS — see src/components/MobileShell.tsx and the mobile design thesis:
// mobile is a read/react/notify/share client, PC is the capture/author client.
//
// Viewport-based on purpose. A narrow desktop window getting the mobile shell
// is fine — the reader-first decisions (no BYOK prompt, bottom nav) are
// reasonable at any small width. We don't gate on `pointer: coarse` because a
// touch laptop shouldn't lose the authoring workshop.
export const MOBILE_BREAKPOINT_PX = 760;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Safari <14 only supports the deprecated addListener signature.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}
