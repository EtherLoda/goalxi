/**
 * MatchBentoLayout.tsx — asymmetric grid container for the match page.
 *
 * Modelled on `web/src/components/tactics/editor/EditorBentoGrid.tsx`.
 * Layout:
 *
 *   ROW A — full-width Match Score Hero
 *   ROW B — full-width Match Timeline
 *   ROW C — Pitch (full-width when no sidebar, otherwise 2/3 + sidebar 1/3)
 *   ROW D — Live Commentary (full width, scrollable)
 *
 * The `sidebar` prop is now OPTIONAL — when omitted (or null), the
 * pitch takes the full row width. This matches the recent redesign:
 * lane-strength + xG live ON the pitch via the stats-mode toggle,
 * and the right column is no longer needed. Pages that still want a
 * sidebar can pass it through.
 *
 * Mobile (`<lg`): everything collapses to a single vertical stack.
 *
 * Right-side scroll containment (when sidebar is present) follows
 * the editor precedent: `lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1`.
 */

'use client';

import { type ReactNode } from 'react';

interface MatchBentoLayoutProps {
  scoreHero: ReactNode;
  timeline: ReactNode;
  pitch: ReactNode;
  /** Optional right-column stack — bento tiles. Pass null/omit to
   *  give the pitch the full row width. */
  sidebar?: ReactNode;
  commentary: ReactNode;
  className?: string;
}

export function MatchBentoLayout({
  scoreHero,
  timeline,
  pitch,
  sidebar,
  commentary,
  className = '',
}: MatchBentoLayoutProps) {
  const hasSidebar = sidebar !== undefined && sidebar !== null;
  return (
    <div
      className={`p-6 md:p-8 max-w-[1600px] mx-auto w-full space-y-4 ${className}`}
      data-testid="match-bento-layout"
    >
      {/* ROW A — Score Hero (full width) */}
      <div>{scoreHero}</div>

      {/* ROW B — Timeline (full width) */}
      <div>{timeline}</div>

      {/* ROW C — Pitch + optional Sidebar. When sidebar is omitted
          the pitch takes the full row. */}
      {hasSidebar ? (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
          <div>{pitch}</div>
          <div className="flex flex-col gap-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            {sidebar}
          </div>
        </div>
      ) : (
        <div>{pitch}</div>
      )}

      {/* ROW D — Commentary (full width) */}
      <div>{commentary}</div>
    </div>
  );
}