'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The rail's player card, shared by the three places that print a player
 * name during a match: the pitch markers, the commentary feed and the
 * highlights list.
 *
 * The card is not a modal and not a route — it slides into the right rail in
 * place of the match panels, so the pitch keeps its width and the reader can
 * still see the player they clicked on. That means the state must live above
 * both the rail and the three name sources, which is what this context is.
 */
interface PlayerCardValue {
  /** Player currently in the rail, or null when the rail shows the match panels. */
  readonly playerId: number | null;
  readonly openPlayer: (playerId: number) => void;
  readonly closePlayer: () => void;
}

const PlayerCardContext = createContext<PlayerCardValue | null>(null);

export function PlayerCardProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<number | null>(null);

  const openPlayer = useCallback((next: number) => {
    // Guard the ids that reach us from event payloads: they travel as strings
    // over the websocket, and a 0/NaN would open a card that can never load.
    if (!Number.isInteger(next) || next <= 0) return;
    setPlayerId(next);
  }, []);

  const closePlayer = useCallback(() => setPlayerId(null), []);

  const value = useMemo(
    () => ({ playerId, openPlayer, closePlayer }),
    [playerId, openPlayer, closePlayer],
  );

  return <PlayerCardContext.Provider value={value}>{children}</PlayerCardContext.Provider>;
}

/**
 * Optional read: the pitch is also rendered on the tactics pages, where there
 * is no provider and no card to open. Those callers get `null` and simply do
 * not wire a click handler.
 */
export function usePlayerCardOptional(): PlayerCardValue | null {
  return useContext(PlayerCardContext);
}
