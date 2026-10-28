import React from 'react';
import { MatchRailDeck } from './MatchRailDeck';
import { PlayerCardProvider } from './player-card-context';

/**
 * MatchPage — the one shell both match modes render into.
 *
 * `docs/design/match-page-plan.md` §5: the live page and the report page are
 * the same page in two states. Before this component they were two component
 * trees (~330 and ~595 lines) that had already drifted — the report had a
 * bench and a commentary panel in the sidebar, the live page had a connection
 * banner and put its commentary full width. Everything below is shared except
 * what the callers pass in through slots; `mode` exists so the few
 * mode-specific affordances (the connection banner, the report footer) have
 * somewhere to hang.
 *
 * Layout is a slot API rather than a prop bag on purpose: `MatchScoreHero`
 * takes fourteen props and the two callers disagree on several of them, so
 * the callers construct it. The shell only decides order and geometry.
 */

export type MatchPageMode = 'live' | 'report';

interface MatchPageProps {
  mode: MatchPageMode;
  /** Full-width strip above the score hero (live connection / full-time state). */
  banner?: React.ReactNode;
  hero: React.ReactNode;
  /** Full-width verdict strip under the hero (report only, post-match). */
  verdict?: React.ReactNode;
  /** Pitch + view toggle. */
  main: React.ReactNode;
  /** Minute track / match spine. Sits under the pitch in the left column. */
  timeline?: React.ReactNode;
  /** Commentary — bottom of the left column, directly under the timeline. */
  commentary?: React.ReactNode;
  /** Right rail. */
  aside?: React.ReactNode;
  /** Full-width strip under the grid (the report's bench). */
  footer?: React.ReactNode;
  /** The live rail scrolls inside the viewport; the report rail grows with the page. */
  asideScroll?: boolean;
}

export function MatchPage({
  mode,
  banner,
  hero,
  verdict,
  main,
  timeline,
  commentary,
  aside,
  footer,
  asideScroll = false,
}: MatchPageProps) {
  return (
    <PlayerCardProvider>
      <article
        className="max-w-[1120px] mx-auto w-full space-y-4"
        data-match-page-mode={mode}
      >
        {banner}

        {hero}

        {verdict}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div className="space-y-3">
            {main}
            {/* Text blocks never span the full column: a 980px line of prose is
                unreadable, and the pitch would render at the same width. */}
            {timeline && (
              <div className="w-full">{timeline}</div>
            )}
            {commentary && (
              <div className="w-full">{commentary}</div>
            )}
          </div>

          <aside
            className={
              asideScroll
                ? 'flex flex-col gap-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto'
                : 'flex flex-col gap-3'
            }
          >
            {/* The rail is a deck: match panels, or the player card that
                slides in over them. See MatchRailDeck. */}
            <MatchRailDeck>{aside}</MatchRailDeck>
          </aside>
        </div>

        {footer}
      </article>
    </PlayerCardProvider>
  );
}
