'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { RosterFilters, filterAndSort, type RosterFilterKey, type RosterSortKey } from './RosterFilters';
import { RosterPlayerCard } from './RosterPlayerCard';

interface PlayerRosterProps {
  players: Player[];
  assignedPlayerIds: Set<string>;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
}

export function PlayerRoster({ players, assignedPlayerIds, onDragStart, onDragEnd }: PlayerRosterProps) {
  const t = useTranslations('tactics.roster');
  const [sort, setSort] = useState<RosterSortKey>('overall');
  const [filter, setFilter] = useState<RosterFilterKey>('all');

  const { available, onPitch } = filterAndSort(players, filter, sort, assignedPlayerIds);

  return (
    <GlassPanel size="md">
      <div className="flex items-center justify-between mb-3">
        <KickerLabel>{t('title')}</KickerLabel>
        <span className="font-label text-[10px] text-outline">
          {available.length} {t('available')} · {onPitch.length} {t('onPitch')}
        </span>
      </div>
      <RosterFilters
        sort={sort}
        onSortChange={setSort}
        filter={filter}
        onFilterChange={setFilter}
      />
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {available.length === 0 && onPitch.length === 0 && (
          <div className="text-center text-outline py-8 font-label text-xs uppercase tracking-widest">
            No players
          </div>
        )}
        {available.map((p) => (
          <RosterPlayerCard
            key={p.id}
            player={p}
            isAssigned={false}
            onDragStart={() => onDragStart(p.id)}
            onDragEnd={onDragEnd}
          />
        ))}
        {onPitch.length > 0 && available.length > 0 && (
          <div className="border-t border-outline-variant/20 my-3" />
        )}
        {onPitch.map((p) => (
          <RosterPlayerCard
            key={p.id}
            player={p}
            isAssigned
            onDragStart={() => onDragStart(p.id)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </GlassPanel>
  );
}
