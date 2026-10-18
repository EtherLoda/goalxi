'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Where the player is inside the editor.
 *
 * Desktop renders two tabs (阵容 / 战术与换人) and folds `changes` into the
 * tactical tab; mobile renders three steps. The value is shared so a link
 * copied on a phone (`?tab=changes`) still lands on the right place, and so
 * resizing the window never invents a new position.
 */
export type EditorTab = 'lineup' | 'tactics' | 'changes';

export const EDITOR_TABS: readonly EditorTab[] = ['lineup', 'tactics', 'changes'];

export function parseEditorTab(raw: string | null | undefined): EditorTab {
  return EDITOR_TABS.includes(raw as EditorTab) ? (raw as EditorTab) : 'lineup';
}

/**
 * Reads and writes `?tab=`. `router.replace` is deliberate: paging through
 * the tabs is not navigation, and pushing would fill the back stack with
 * editor states so the player's browser back button no longer leaves the
 * page.
 *
 * `lineup` is the default and is therefore never written to the URL — the
 * canonical address of a fresh editor is the bare path.
 */
export function useUrlTab(): [EditorTab, (tab: EditorTab) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('tab');
  const tab = useMemo(() => parseEditorTab(raw), [raw]);

  const setTab = useCallback(
    (next: EditorTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'lineup') params.delete('tab');
      else params.set('tab', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [tab, setTab];
}
