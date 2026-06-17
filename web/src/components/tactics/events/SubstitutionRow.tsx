'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { PitchSlot, TacticalEvent } from '../types';
import { PITCH_SLOTS } from '../types';
import { positionShortLabel } from '../shared/position-legend';

interface SubstitutionRowProps {
  index: number;
  event: Extract<TacticalEvent, { kind: 'sub' }>;
  starters: Player[];
  bench: Player[];
  disabled: boolean;
  onUpdate: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemove: (index: number) => void;
}

export function SubstitutionRow({ index, event, starters, bench, disabled, onUpdate, onRemove }: SubstitutionRowProps) {
  const t = useTranslations('tactics.events');
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 p-2 rounded-lg bg-surface-container border border-outline-variant/20" data-testid={`event-sub-${index}`}>
      <input
        type="number"
        min={1}
        max={90}
        value={event.minute}
        onChange={(e) => onUpdate(index, { minute: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
        disabled={disabled}
        className="w-12 px-1 py-1 rounded bg-surface-container-highest text-center font-headline font-bold text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label={t('minute')}
      />
      <select
        value={event.outId}
        onChange={(e) => onUpdate(index, { outId: e.target.value })}
        disabled={disabled}
        className="w-full px-2 py-1 rounded bg-surface-container-highest text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">{t('out')}</option>
        {starters.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.overall})
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined text-base text-primary">arrow_forward</span>
      <select
        value={event.inId}
        onChange={(e) => onUpdate(index, { inId: e.target.value })}
        disabled={disabled}
        className="w-full px-2 py-1 rounded bg-surface-container-highest text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">{t('in')}</option>
        {bench.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.overall})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="p-1 rounded text-outline hover:text-error transition-colors disabled:opacity-50"
        aria-label="Remove"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}

interface MoveRowProps {
  index: number;
  event: Extract<TacticalEvent, { kind: 'move' }>;
  pitchPlayers: Player[];
  disabled: boolean;
  onUpdate: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemove: (index: number) => void;
}

export function MoveRow({ index, event, pitchPlayers, disabled, onUpdate, onRemove }: MoveRowProps) {
  const t = useTranslations('tactics.events');
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 p-2 rounded-lg bg-surface-container border border-outline-variant/20" data-testid={`event-move-${index}`}>
      <input
        type="number"
        min={1}
        max={90}
        value={event.minute}
        onChange={(e) => onUpdate(index, { minute: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
        disabled={disabled}
        className="w-12 px-1 py-1 rounded bg-surface-container-highest text-center font-headline font-bold text-sm text-tertiary focus:outline-none focus:ring-1 focus:ring-tertiary"
        aria-label={t('minute')}
      />
      <select
        value={event.playerId}
        onChange={(e) => onUpdate(index, { playerId: e.target.value })}
        disabled={disabled}
        className="w-full px-2 py-1 rounded bg-surface-container-highest text-sm text-white focus:outline-none focus:ring-1 focus:ring-tertiary"
      >
        <option value="">{t('player')}</option>
        {pitchPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.overall})
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined text-base text-tertiary">arrow_forward</span>
      <select
        value={event.toSlot as string}
        onChange={(e) => onUpdate(index, { toSlot: e.target.value as PitchSlot })}
        disabled={disabled}
        className="w-full px-2 py-1 rounded bg-surface-container-highest text-sm text-white focus:outline-none focus:ring-1 focus:ring-tertiary"
      >
        <option value="">{t('newPosition')}</option>
        {PITCH_SLOTS.map((s) => (
          <option key={s} value={s}>
            {positionShortLabel(s)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="p-1 rounded text-outline hover:text-error transition-colors disabled:opacity-50"
        aria-label="Remove"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
