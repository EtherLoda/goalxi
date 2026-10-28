'use client';

import type { ReactNode } from 'react';
import { PlayerCardPanel } from './PlayerCardPanel';
import { usePlayerCardOptional } from './player-card-context';

/**
 * The right rail as a two-panel deck.
 *
 * Closed, it is exactly the old rail. Opened, the match panels slide out to
 * the left while the player card slides in from the right — the reader keeps
 * the match in view and the pitch never changes width, which is the whole
 * point of putting the card here instead of in a modal.
 *
 * The panels stay in flow so the rail keeps its height; the card is layered
 * above them. Both move by `translate-x-full`, i.e. exactly one rail width.
 */
export function MatchRailDeck({ children }: { children: ReactNode }) {
  const context = usePlayerCardOptional();
  const open = context?.playerId != null;

  return (
    <div className="relative w-full overflow-hidden" data-rail-deck={open ? 'card' : 'match'}>
      <div
        aria-hidden={open || undefined}
        className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
          open ? '-translate-x-full' : 'translate-x-0'
        }`}
      >
        {children}
      </div>
      <div
        className={`absolute inset-x-0 top-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {context ? <PlayerCardPanel /> : null}
      </div>
    </div>
  );
}
