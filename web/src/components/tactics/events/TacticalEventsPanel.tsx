'use client';

/**
 * TacticalEventsPanel — the planned substitutions and position moves.
 *
 * Optional by design: most matches are submitted with an empty list, so on
 * the 战术与换人 tab the panel starts collapsed and only the count is shown
 * in the header. Adding an event expands it, because a row you cannot see
 * is a row you will forget to check.
 *
 * `collapsible={false}` is used where the panel *is* the page (the mobile
 * 换人 step) and collapsing it would leave the step empty.
 */
import { AppIcon } from "@/components/icons/AppIcon";
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import type { Player } from '@/lib/api';
import type { TacticalEvent } from '../types';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { TacticalEventRow } from './TacticalEventRow';
import { EASE, DURATION } from '@/lib/motion';

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
  /** Show a disclosure toggle in the header. Defaults to true. */
  collapsible?: boolean;
  /** Start closed. Ignored when `collapsible` is false. */
  defaultCollapsed?: boolean;
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
  collapsible = true,
  defaultCollapsed = true,
}: TacticalEventsPanelProps) {
  const t = useTranslations('tactics.events');
  const [open, setOpen] = useState(() => !collapsible || !defaultCollapsed);
  const isOpen = !collapsible || open;

  const handleAdd = (add: () => void) => {
    add();
    setOpen(true);
  };

  return (
    <GlassPanel size="md" className="relative overflow-hidden">
      {/* soft primary glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 w-24 h-24 rounded-full bg-primary/5 blur-2xl"
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-3 gap-2">
          <button
            type="button"
            onClick={() => collapsible && setOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-controls="tactical-events-body"
            disabled={!collapsible}
            className="flex items-center gap-2 min-w-0 text-left rounded-lg disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary border border-primary/20 shrink-0">
              <AppIcon name="event_list" className="text-[16px]" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.08em] text-on-surface">
                <span className="truncate">{t('title')}</span>
                {events.length > 0 ? (
                  <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-kicker font-bold tabular-nums text-primary">
                    {events.length}
                  </span>
                ) : null}
              </span>
              <span className="block text-kicker font-bold uppercase tracking-widest text-outline truncate">
                {t('subtitle')}
              </span>
            </span>
            {collapsible ? (
              <motion.span
                aria-hidden
                animate={{ rotate: isOpen ? 0 : -90 }}
                transition={{ duration: DURATION.quick, ease: EASE.standard }}
                className="ml-1 flex text-outline"
              >
                <AppIcon name="expand_more" className="text-[18px]" />
              </motion.span>
            ) : null}
          </button>
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleAdd(onAddSub)}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-on-primary font-label text-kicker font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <AppIcon name="swap_horiz" className="text-[12px]" />
              {t('sub')}
            </button>
            <button
              type="button"
              onClick={() => handleAdd(onAddMove)}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-tertiary/20 text-tertiary border border-tertiary/30 font-label text-kicker font-bold uppercase tracking-widest hover:bg-tertiary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <AppIcon name="open_with" className="text-[12px]" />
              {t('move')}
            </button>
          </div>
        </div>

        {isOpen ? (
          <div id="tactical-events-body">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-outline-variant/20 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center mb-2">
                  <AppIcon name="event_busy" className="text-[20px] text-outline" />
                </div>
                <p className="font-label text-kicker font-bold uppercase tracking-widest text-outline px-4">
                  {t('empty')}
                </p>
                <p className="mt-1.5 max-w-[300px] px-4 font-body text-label leading-relaxed text-on-surface-variant/75">
                  {t('emptyHint')}
                </p>
              </div>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {events.map((event, idx) => (
                    <TacticalEventRow
                      key={event.id ?? `event-${idx}`}
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
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}
