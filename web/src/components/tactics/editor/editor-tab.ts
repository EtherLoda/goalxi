/**
 * The editor's position model, kept free of React and of `next/navigation` so
 * it stays unit-testable (the web jest project runs in a node environment with
 * `.spec.ts` only, so a module that imports a hook cannot be imported at all).
 *
 * `use-url-tab.ts` owns the hook and re-exports everything here.
 */

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

/** Anything unrecognised (including a missing parameter) means "阵容". */
export function parseEditorTab(raw: string | null | undefined): EditorTab {
  return EDITOR_TABS.includes(raw as EditorTab) ? (raw as EditorTab) : 'lineup';
}

/**
 * The URL for a tab, given the current path and query string.
 *
 * `lineup` is the default, so it is never written — the canonical address of
 * a fresh editor is the bare path, and a round trip through the tabs leaves
 * no residue. Other query parameters (a debugging flag, a campaign tag) are
 * preserved: switching tabs must not drop them.
 */
export function tabHref(
  pathname: string,
  currentQuery: string,
  tab: EditorTab,
): string {
  const params = new URLSearchParams(currentQuery);
  if (tab === 'lineup') params.delete('tab');
  else params.set('tab', tab);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
