'use client';

/**
 * use-team-tactics.ts — loads the team-tactic requirement table once.
 *
 * The table is static for a deployment, so it is fetched once per page load
 * and cached at module scope: switching between the 阵容 and 战术与换人 tabs
 * must not re-fetch it, and remounting the editor (e.g. after a submit)
 * must not either. A failed fetch is not retried automatically — the caller
 * renders the picker as "unavailable" rather than blocking the whole
 * editor, because the lineup half of the page does not need the table.
 */
import { useEffect, useState } from 'react';
import {
  api,
  type PositionFamilyCode,
  type TeamTacticDefinition,
} from '@/lib/api';

export interface TeamTacticsTable {
  tactics: TeamTacticDefinition[];
  families: Record<string, PositionFamilyCode>;
  familyOrder: PositionFamilyCode[];
}

let cached: TeamTacticsTable | null = null;
let inflight: Promise<TeamTacticsTable> | null = null;

/** Test hook: forget the cached table so each case starts clean. */
export function resetTeamTacticsCache(): void {
  cached = null;
  inflight = null;
}

function loadTable(): Promise<TeamTacticsTable> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.game
      .getTeamTactics()
      .then((response) => {
        const table: TeamTacticsTable = {
          tactics: response.tactics,
          families: response.families,
          familyOrder: response.familyOrder,
        };
        cached = table;
        return table;
      })
      .catch((error: unknown) => {
        // Drop the failed promise so a later mount can retry; the cache
        // itself stays null.
        inflight = null;
        throw error;
      });
  }
  return inflight;
}

export interface UseTeamTacticsResult {
  table: TeamTacticsTable | null;
  isLoading: boolean;
  error: string | null;
}

export function useTeamTactics(): UseTeamTacticsResult {
  // Seeded from the module cache so a remount (tab switch, submit) renders
  // the table on the first paint instead of flashing a loading state.
  const [table, setTable] = useState<TeamTacticsTable | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `loadTable` resolves from the cache when it is already warm, so this
    // is a no-op assignment in that case rather than a second fetch.
    let cancelled = false;
    loadTable()
      .then((loaded) => {
        if (cancelled) return;
        setTable(loaded);
        setIsLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Failed to load team tactics');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { table, isLoading, error };
}
