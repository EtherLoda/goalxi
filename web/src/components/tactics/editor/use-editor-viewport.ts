'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which shell the tactics editor renders: the two-tab desktop layout or the
 * three-step mobile wizard. Both share the same draft state and the same
 * `?tab=` URL value, so switching viewports never loses work.
 */
export type EditorViewport = 'desktop' | 'mobile';

/** Matches Tailwind's `lg` breakpoint, the one the old grid switched on. */
const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): EditorViewport {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia(DESKTOP_QUERY).matches ? 'desktop' : 'mobile';
}

/**
 * The server cannot know the viewport, so it has to guess. We guess
 * `desktop` because that is the superset layout: guessing `mobile` would
 * paint a stepper and a sticky footer for one frame on a desktop, which is
 * a bigger jump than painting the tab bar for one frame on a phone.
 *
 * `useSyncExternalStore` (rather than `useState` + `useEffect`) is what
 * keeps the first client frame equal to the server frame, so there is no
 * hydration mismatch warning and no visible swap on desktop.
 */
function getServerSnapshot(): EditorViewport {
  return 'desktop';
}

export function useEditorViewport(): EditorViewport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
