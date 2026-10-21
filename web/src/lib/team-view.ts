/**
 * Opening another club's dashboard.
 *
 * The "look at another team" feature is dashboard *mode*, not a route of its
 * own: the club is carried in `?team=`, mirrored into `useGameStore().viewTeamId`
 * so every page inside the shell can read it. That means the navigation has two
 * halves — update the store, and put the id in the URL — and every call site
 * that forgets one half ends up either showing the previous club or losing the
 * state on refresh.
 *
 * Both halves live here so the four call sites (league standings, the squad
 * status board, the transfer card, search) cannot drift apart again.
 */

export function dashboardTeamHref(locale: string, teamId: string): string {
  return `/${locale}/dashboard?team=${teamId}`;
}

/** Leaving the mode: back to your own dashboard, no `?team=`. */
export function ownDashboardHref(locale: string): string {
  return `/${locale}/dashboard`;
}

/**
 * Opening another club's PUBLIC page.
 *
 * The dashboard copy above opens the same club inside your own management
 * shell, which is a different thing: it borrows your sidebar, your season
 * panel and your bank balance. A club name in a table means "who is this",
 * so it points at the public page.
 */
export function clubHref(locale: string, teamId: string): string {
  return `/${locale}/teams/${teamId}`;
}
