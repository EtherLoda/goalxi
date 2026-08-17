import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation primitives. Re-exports `Link`,
 * `usePathname`, `useRouter`, `getPathname`, and `redirect`
 * bound to the project's `routing` config (locales, prefix
 * mode, …).
 *
 * Use the `usePathname` / `useRouter` from THIS module instead
 * of `next/navigation` anywhere a route URL gets built or
 * locale-prepended. The locale-aware variants:
 *   - `usePathname()` returns the path WITHOUT the locale
 *     prefix (e.g. `/settings/site`, not `/en/settings/site`),
 *     which is what `router.replace({pathname})` wants.
 *   - `useRouter().replace(href, {locale})` rewrites the
 *     locale segment for you and accepts the bare pathname
 *     above. No more hand-built `/en/...` strings.
 *
 * `next/navigation`'s primitives are still fine for
 * `useSearchParams` and `useParams` (those are
 * locale-agnostic).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);
