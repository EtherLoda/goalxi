'use client';

/**
 * TacticalEventsPanel — "Tactical Changes" panel that lists every
 * planned sub / move. Modeled on the legacy
 * `frontend/components/tactics/TacticsEditor.tsx` for visual polish:
 * gradient surface + icon header + single Add button + animated cards.
 */
import React from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { TacticalEvent } from '../types';
import { GlassPanel } from '../shared/GlassPanel';
import { TacticalEventRow } from './TacticalEventRow';

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
    <GlassPanel size="md" className="relative overflow-hidden">
      {/* soft primary glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 w-24 h-24 rounded-full bg-primary/5 blur-2xl"
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary border border-primary/20 shrink-0">
              <span className="material-symbols-outlined text-[16px]">event_list</span>
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black uppercase tracking-[0.08em] text-on-surface truncate">
                {t('title')}
              </h3>
              <p className="text-[9px] font-bold uppercase tracking-widest text-outline truncate">
                {t('subtitle')}
              </p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={onAddSub}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-on-primary font-label text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
              {t('sub')}
            </button>
            <button
              type="button"
              onClick={onAddMove}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-tertiary/20 text-tertiary border border-tertiary/30 font-label text-[10px] font-bold uppercase tracking-widest hover:bg-tertiary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">open_with</span>
              {t('move')}
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-outline-variant/20 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-[20px] text-outline/40">event_busy</span>
            </div>
            <p className="font-label text-[10px] font-bold uppercase tracking-widest text-outline px-4">
              {t('empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {events.map((event, idx) => (
              <TacticalEventRow
                key={`event-${idx}`}
                index={idx}
                event={event}
                starters={starters}
                bench={benchPlayers}
                pitchPlayers={pitchPlayers}
                disabled={disabled}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
