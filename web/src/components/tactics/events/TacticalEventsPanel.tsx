'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { TacticalEvent } from '../types';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { MoveRow, SubstitutionRow } from './SubstitutionRow';

interface TacticalEventsPanelProps {
  events: TacticalEvent[];
  starters: Player[];
  benchPlayers: Player[];
  pitchPlayers: Player[];
  disabled: boolean;
  onAddSub: () => void;
  onAddMove: () => void;
  onUpdate: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemove: (index: number) => void;
}

export function TacticalEventsPanel({
  events,
  starters,
  benchPlayers,
  pitchPlayers,
  disabled,
  onAddSub,
  onAddMove,
  onUpdate,
  onRemove,
}: TacticalEventsPanelProps) {
  const t = useTranslations('tactics.events');

  return (
    <GlassPanel size="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-primary">event_list</span>
          <KickerLabel>{t('title')}</KickerLabel>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onAddSub}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 font-label text-[9px] tracking-widest uppercase hover:bg-primary/30 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
            {t('sub')}
          </button>
          <button
            type="button"
            onClick={onAddMove}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 rounded bg-tertiary/20 text-tertiary border border-tertiary/30 font-label text-[9px] tracking-widest uppercase hover:bg-tertiary/30 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]">open_with</span>
            {t('move')}
          </button>
        </div>
      </div>
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-outline-variant/20 rounded-xl">
          <span className="material-symbols-outlined text-2xl text-outline/40 mb-1">event_busy</span>
          <span className="font-label text-[10px] tracking-widest uppercase text-outline">
            {t('empty')}
          </span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {events.map((event, idx) =>
            event.kind === 'sub' ? (
              <SubstitutionRow
                key={`sub-${idx}`}
                index={idx}
                event={event}
                starters={starters}
                bench={benchPlayers}
                disabled={disabled}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ) : (
              <MoveRow
                key={`move-${idx}`}
                index={idx}
                event={event}
                pitchPlayers={pitchPlayers}
                disabled={disabled}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ),
          )}
        </div>
      )}
    </GlassPanel>
  );
}
