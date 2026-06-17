'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';

export type RosterSortKey = 'overall' | 'stamina' | 'form' | 'name';
export type RosterFilterKey = 'all' | 'gk' | 'def' | 'mid' | 'fwd';

interface RosterFiltersProps {
  sort: RosterSortKey;
  onSortChange: (key: RosterSortKey) => void;
  filter: RosterFilterKey;
  onFilterChange: (key: RosterFilterKey) => void;
}

export function RosterFilters({ sort, onSortChange, filter, onFilterChange }: RosterFiltersProps) {
  const t = useTranslations('tactics.roster');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex gap-1 p-0.5 rounded-lg bg-surface-container-highest">
        {(['all', 'gk', 'def', 'mid', 'fwd'] as RosterFilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={`px-2.5 py-1 rounded font-label text-[10px] tracking-widest uppercase transition-all ${
              filter === key
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t(`filter.${key}`)}
          </button>
        ))}
      </div>
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
  filter: RosterFilterKey,
  sort: RosterSortKey,
  assignedIds: Set<string>,
): { available: Player[]; onPitch: Player[] } {
  const filtered = players.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'gk') return p.isGoalkeeper;
    if (filter === 'def') return !p.isGoalkeeper && isDef(p.position);
    if (filter === 'mid') return !p.isGoalkeeper && isMid(p.position);
    if (filter === 'fwd') return !p.isGoalkeeper && isFwd(p.position);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
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

function isDef(pos?: string): boolean {
  return pos === 'DEF' || (pos?.startsWith('CB') ?? false) || pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB';
}
function isMid(pos?: string): boolean {
  return pos === 'MID' || pos === 'CM' || pos === 'DM' || pos === 'AM' || pos === 'LM' || pos === 'RM';
}
function isFwd(pos?: string): boolean {
  return pos === 'FWD' || pos === 'ST' || pos === 'CF' || pos === 'LW' || pos === 'RW';
}
