'use client';

/**
 * ConditionSelect — compact dropdown for picking an event's trigger
 * condition (always / leading / trailing / tied / notLeading / notTrailing).
 * Smaller and lighter than PlayerSelect — no search, no avatars, just a
 * short list of single-line options.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EVENT_CONDITIONS, type EventCondition } from '../types';

export interface ConditionSelectProps {
  value: EventCondition;
  onChange: (next: EventCondition) => void;
  disabled?: boolean;
}

/** Per-condition tone (icon + ring color) — keeps the chip scannable. */
const CONDITION_META: Record<EventCondition, { icon: string; tone: string }> = {
  always: { icon: 'bolt', tone: 'border-outline-variant/40 text-outline' },
  leading: { icon: 'trending_up', tone: 'border-emerald-500/40 text-emerald-400' },
  trailing: { icon: 'trending_down', tone: 'border-red-500/40 text-red-400' },
  tied: { icon: 'balance', tone: 'border-amber-400/40 text-amber-300' },
  notLeading: { icon: 'horizontal_rule', tone: 'border-orange-500/40 text-orange-300' },
  notTrailing: { icon: 'shield', tone: 'border-sky-500/40 text-sky-300' },
};

export function ConditionSelect({ value, onChange, disabled = false }: ConditionSelectProps) {
  const t = useTranslations('tactics.events.condition');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    openUpward: false,
  });

  const POPOVER_HEIGHT = 240;
  const MARGIN = 6;
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < POPOVER_HEIGHT + MARGIN;
    setPos({
      top: openUpward
        ? Math.max(MARGIN, rect.top - POPOVER_HEIGHT - MARGIN)
        : rect.bottom + MARGIN,
      left: rect.left,
      openUpward,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = CONDITION_META[value];

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-surface-container/50 font-label text-[9px] font-bold uppercase tracking-widest transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : `cursor-pointer hover:${meta.tone.split(' ')[0]}`
        } ${meta.tone}`}
        title={t(value)}
      >
        <span className="material-symbols-outlined text-[11px]">{meta.icon}</span>
        {t(value)}
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{ top: pos.top, left: pos.left, width: 168 }}
          className="fixed z-50 max-h-[240px] flex flex-col rounded-lg border border-outline-variant/30 bg-surface-container-highest shadow-xl shadow-black/40"
        >
          <div className="overflow-y-auto p-1 space-y-0.5">
            {EVENT_CONDITIONS.map((c) => {
              const m = CONDITION_META[c];
              const active = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] font-bold uppercase tracking-widest transition-colors ${
                    active
                      ? 'bg-primary/15 text-white'
                      : 'text-on-surface hover:bg-surface-container/60'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[13px] ${active ? 'text-primary' : 'text-outline'}`}>{m.icon}</span>
                  <span className="flex-1">{t(c)}</span>
                  {active && (
                    <span className="material-symbols-outlined text-[12px] text-primary">check</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}