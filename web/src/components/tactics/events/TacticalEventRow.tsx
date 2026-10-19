'use client';

/**
 * TacticalEventRow — single card for either a sub or a position move.
 * Replaces the previous separate SubstitutionRow / MoveRow split. Renders
 * the "Tactical Changes" row with header, player/position selectors, and
 * a remove button.
 *
 * Visual:
 *   ┌───────────────────────────────────────────────┐
 *   │  [60'] [Sub|Move]                       [×]   │  ← header
 *   │  ─────────────────────────────────────────    │
 *   │  Out            →           In / New Position │
 *   │  [PlayerSelect]      [PlayerSelect/Position] │
 *   └───────────────────────────────────────────────┘
 *
 * Toggling Sub↔Move clears the player/position fields (the reducer's
 * UPDATE_EVENT handler does the type-aware replacement).
 */
import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { EventCondition, TacticalEvent } from '../types';
import { ConditionSelect } from './ConditionSelect';
import { PlayerSelect } from './PlayerSelect';
import { PositionSelect } from './PositionSelect';

interface TacticalEventRowProps {
  index: number;
  event: TacticalEvent;
  starters: Player[];
  bench: Player[];
  pitchPlayers: Player[];
  disabled: boolean;
  onUpdate: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemove: (index: number) => void;
}

export function TacticalEventRow({
  index,
  event,
  starters,
  bench,
  pitchPlayers,
  disabled,
  onUpdate,
  onRemove,
}: TacticalEventRowProps) {
  const t = useTranslations('tactics.events');

  const isSub = event.kind === 'sub';

  return (
    <motion.div
      // Entrance and exit. The previous `animate-in slide-in-from-left-2
      // fade-in` classes came from `tw-animate-css`, which this project does
      // not install: they compiled to nothing and the row appeared instantly.
      // The exit collapses height as well as opacity, so deleting a row slides
      // the rest up instead of leaving a gap that snaps shut.
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="group/item relative rounded-xl border border-outline-variant/20 bg-surface-container/40 p-3 hover:border-primary/40 transition-colors"
      data-testid={`tactical-event-${index}`}
    >
      {/* Header — minute + delete. The event's kind is fixed at creation
          time via the panel's Add Sub / Add Move buttons. */}
      <div className="flex items-center justify-between mb-2.5 pb-2.5 border-b border-outline-variant/15">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-highest border border-outline-variant/20">
            <AppIcon name="schedule" className="text-[12px] text-primary" />
            <input
              type="number"
              min={1}
              max={90}
              value={event.minute}
              onChange={(e) =>
                onUpdate(index, { minute: Math.max(1, Math.min(90, Number(e.target.value) || 1)) } as Partial<TacticalEvent>)
              }
              disabled={disabled}
              className="w-9 bg-transparent text-label font-bold text-on-surface text-center focus:outline-none tabular-nums"
              aria-label={t('minute')}
            />
          </div>

          {/* Kind badge — mirrors ConditionSelect chip dimensions
              (same px-2 py-0.5, text-kicker, border) so the two pills
              line up vertically next to each other. */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-label text-kicker font-bold uppercase tracking-widest ${
              isSub
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-tertiary/15 text-tertiary border-tertiary/30'
            }`}
          >
            <AppIcon name={isSub ? 'swap_horiz' : 'open_with'} className="text-label" />
            {isSub ? t('sub') : t('move')}
          </span>

          <ConditionSelect
            value={(event.condition ?? 'always') as EventCondition}
            onChange={(condition) =>
              onUpdate(index, {
                condition,
                // `always` is the implicit default — strip the field so the
                // payload stays clean.
                ...(condition === 'always' ? { condition: undefined } : {}),
              } as Partial<TacticalEvent>)
            }
            disabled={disabled}
          />
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          aria-label={t('deleteAria')}
          className="p-1 rounded text-outline hover:text-error hover:bg-error/10 transition opacity-0 group-hover/item:opacity-100 disabled:opacity-50"
        >
          <AppIcon name="close" className="text-[14px]" />
        </button>
      </div>

      {/* Body — 3-column grid: A → B / position */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
        {/* Out / Player */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 px-0.5">
            {isSub ? (
              <AppIcon name="remove_circle" className="text-kicker text-red-400" />
            ) : (
              <AppIcon name="open_with" className="text-kicker text-tertiary" />
            )}
            <span className={`text-kicker font-black uppercase tracking-widest ${isSub ? 'text-red-300/80' : 'text-tertiary/80'}`}>
              {isSub ? t('outLabel') : t('player')}
            </span>
          </div>
          <PlayerSelect
            value={isSub ? event.outId : event.playerId}
            onChange={(id) => {
              if (isSub) {
                onUpdate(index, { outId: id } as Partial<TacticalEvent>);
              } else {
                onUpdate(index, { playerId: id } as Partial<TacticalEvent>);
              }
            }}
            players={isSub ? starters : pitchPlayers}
            tone={isSub ? 'primary' : 'tertiary'}
            placeholder={t('selectPlayer')}
            disabled={disabled}
            showOverall={false}
            showRole={false}
          />
        </div>

        {/* Arrow */}
        <div className="pt-5 flex justify-center text-outline">
          <AppIcon name={isSub ? 'arrow_forward' : 'arrow_forward'} className="text-[16px]" />
        </div>

        {/* In / New Position */}
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-1 px-0.5">
            <span className={`text-kicker font-black uppercase tracking-widest ${isSub ? 'text-positive-soft/80' : 'text-amber-300/80'}`}>
              {isSub ? t('inLabel') : t('newPosition')}
            </span>
            {isSub ? (
              <AppIcon name="add_circle" className="text-kicker text-positive-bright" />
            ) : (
              <AppIcon name="open_with" className="text-kicker text-signal-gold" />
            )}
          </div>
          {isSub ? (
            <PlayerSelect
              value={event.inId}
              onChange={(id) => onUpdate(index, { inId: id } as Partial<TacticalEvent>)}
              players={bench}
              tone="tertiary"
              placeholder={t('selectPlayer')}
              align="right"
              disabled={disabled}
              showOverall={false}
              showRole={false}
            />
          ) : (
            <PositionSelect
              value={event.toSlot}
              onChange={(slot) => onUpdate(index, { toSlot: slot } as Partial<TacticalEvent>)}
              align="right"
              disabled={disabled}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
