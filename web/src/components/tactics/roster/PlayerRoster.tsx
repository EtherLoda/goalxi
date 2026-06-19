'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { RosterFilters, filterAndSort, type RosterSortKey } from './RosterFilters';
import { RosterPlayerCard } from './RosterPlayerCard';
import { DetailedRosterPlayerCard } from './DetailedRosterPlayerCard';

export type RosterDensity = 'compact' | 'detailed';

interface PlayerRosterProps {
  players: Player[];
  assignedPlayerIds: Set<string>;
  density?: RosterDensity;
  onDensityChange?: (density: RosterDensity) => void;
  onDragStart: (playerId: string) => void;
  onDragEnd: () => void;
}

export function PlayerRoster({
  players,
  assignedPlayerIds,
  density = 'detailed',
  onDensityChange,
  onDragStart,
  onDragEnd,
}: PlayerRosterProps) {
  const t = useTranslations('tactics.roster');
  const tDensity = useTranslations('tactics.roster.density');
  const [sort, setSort] = useState<RosterSortKey>('overall');

  const { available, onPitch } = filterAndSort(players, sort, assignedPlayerIds);
  const isDetailed = density === 'detailed';

  return (
    <GlassPanel size="md" className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3 gap-2">
        <KickerLabel>{t('title')}</KickerLabel>
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] text-outline">
            {available.length} {t('available')} · {onPitch.length} {t('onPitch')}
          </span>
          {onDensityChange && (
            <div
              role="group"
              aria-label={tDensity('label')}
              className="inline-flex p-0.5 rounded-lg bg-surface-container-highest"
            >
              <DensityButton
                active={!isDetailed}
                onClick={() => onDensityChange('compact')}
                ariaLabel={tDensity('compactAria')}
                icon="view_module"
              />
              <DensityButton
                active={isDetailed}
                onClick={() => onDensityChange('detailed')}
                ariaLabel={tDensity('detailedAria')}
                icon="view_list"
              />
            </div>
          )}
        </div>
      </div>
      <RosterFilters
        sort={sort}
        onSortChange={setSort}
      />
      <div className="space-y-2 mt-2 flex-1 overflow-y-auto pr-1 min-h-0">
        {available.length === 0 && onPitch.length === 0 && (
          <div className="text-center text-outline py-8 font-label text-xs uppercase tracking-widest">
            No players
          </div>
        )}
        {available.map((p) =>
          isDetailed ? (
            <DetailedRosterPlayerCard
              key={p.id}
              player={p}
              isAssigned={false}
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
            />
          ) : (
            <RosterPlayerCard
              key={p.id}
              player={p}
              isAssigned={false}
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
            />
          ),
        )}
        {onPitch.length > 0 && available.length > 0 && (
          <div className="border-t border-outline-variant/20 my-3" />
        )}
        {onPitch.map((p) =>
          isDetailed ? (
            <DetailedRosterPlayerCard
              key={p.id}
              player={p}
              isAssigned
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
            />
          ) : (
            <RosterPlayerCard
              key={p.id}
              player={p}
              isAssigned
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
            />
          ),
        )}
      </div>
    </GlassPanel>
  );
}

interface DensityButtonProps {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  icon: 'view_module' | 'view_list';
}

function DensityButton({ active, onClick, ariaLabel, icon }: DensityButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
        active
          ? 'bg-primary text-on-primary'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
    </button>
  );
}
