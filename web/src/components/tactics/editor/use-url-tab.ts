'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseEditorTab, tabHref, type EditorTab } from './editor-tab';

export { EDITOR_TABS, parseEditorTab, tabHref } from './editor-tab';
export type { EditorTab } from './editor-tab';

/**
 * Reads and writes `?tab=`. `router.replace` is deliberate: paging through
 * the tabs is not navigation, and pushing would fill the back stack with
 * editor states so the player's browser back button no longer leaves the
 * page.
 *
 * The URL algebra itself lives in `editor-tab.ts` so it can be tested without
 * a React renderer; this hook only wires it to the router.
 */
export function useUrlTab(): [EditorTab, (tab: EditorTab) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('tab');
  const tab = useMemo(() => parseEditorTab(raw), [raw]);

  const setTab = useCallback(
    (next: EditorTab) => {
      router.replace(tabHref(pathname, searchParams.toString(), next), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [tab, setTab];
}
