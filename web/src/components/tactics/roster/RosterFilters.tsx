'use client';

/**
 * RosterFilters — sort-only toolbar for the right-rail PlayerRoster.
 * The previous position filter (all/gk/def/mid/fwd) was removed to keep
 * the right rail focused on the player list; the sort dropdown stays.
 */
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';

export type RosterSortKey = 'overall' | 'stamina' | 'form' | 'name';

interface RosterFiltersProps {
  sort: RosterSortKey;
  onSortChange: (key: RosterSortKey) => void;
}

export function RosterFilters({ sort, onSortChange }: RosterFiltersProps) {
  const t = useTranslations('tactics.roster');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-end mb-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-highest text-on-surface font-label text-[10px] tracking-widest uppercase hover:text-primary"
        >
          <span className="material-symbols-outlined text-[14px]">sort</span>
          {t(`sort.${sort}`)}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 glass-panel rounded-lg p-1 min-w-[140px]">
            {(['overall', 'stamina', 'form', 'name'] as RosterSortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSortChange(key);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-1.5 rounded font-label text-[10px] tracking-widest uppercase transition-colors ${
                  sort === key
                    ? 'bg-primary/20 text-primary'
                    : 'text-on-surface hover:bg-white/5'
                }`}
              >
                {t(`sort.${key}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function filterAndSort(
  players: Player[],
  sort: RosterSortKey,
  assignedIds: Set<string>,
): { available: Player[]; onPitch: Player[] } {
  const sorted = [...players].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'overall') return b.overall - a.overall;
    if (sort === 'stamina') return b.stamina - a.stamina;
    if (sort === 'form') return b.form - a.form;
    return 0;
  });

  return {
    available: sorted.filter((p) => !assignedIds.has(p.id)),
    onPitch: sorted.filter((p) => assignedIds.has(p.id)),
  };
}
