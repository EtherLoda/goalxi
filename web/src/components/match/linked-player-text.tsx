'use client';

import { useMemo } from 'react';
import type { MatchEvent } from '@/lib/api';
import { linkedNamesOfEvent, splitLinkedNames } from './linked-names';
import { usePlayerCardOptional } from './player-card-context';

/**
 * Commentary prose with the player's name as a way into the rail card.
 *
 * The sentence is a single translated string, so the only way to link a name
 * inside it is to find that name in the finished text. We only link names the
 * event actually carries — see `linkedNamesOfEvent` — which keeps the links
 * honest: no guessing from a surname that also appears in the opposition.
 */
export function LinkedPlayerText({ text, event }: { text: string; event: MatchEvent }) {
  const playerCard = usePlayerCardOptional();

  const segments = useMemo(
    () => splitLinkedNames(text, linkedNamesOfEvent(event)),
    [text, event],
  );

  if (!playerCard || segments.every((s) => s.playerId == null)) return <>{text}</>;

  return (
    <>
      {segments.map((segment, i) =>
        segment.playerId == null ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              // The row selects the commentary line; the name opens the card.
              e.stopPropagation();
              playerCard.openPlayer(segment.playerId as number);
            }}
            className="inline rounded-[3px] font-semibold text-inherit underline decoration-white/25 decoration-dotted underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
          >
            {segment.text}
          </button>
        ),
      )}
    </>
  );
}
