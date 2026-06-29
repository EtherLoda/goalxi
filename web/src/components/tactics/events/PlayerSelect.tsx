'use client';

/**
 * PlayerSelect — custom dropdown for picking a player. Inspired by
 * `frontend/components/ui/PlayerSelect.tsx`. Shows the selected player's
 * name + role chip (GK / Outfielder) + OVR score in the trigger, and a
 * filterable popover list of every candidate player.
 *
 * Uses the project's Material Symbols icon set + Tailwind tokens so it
 * matches the rest of the editor (no lucide-react dependency in web/).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';

export interface PlayerSelectProps {
  value: string;
  onChange: (id: string) => void;
  players: Player[];
  placeholder?: string;
  align?: 'left' | 'right';
  disabled?: boolean;
  /** Color theme — controls the trigger border / ring on focus. */
  tone?: 'primary' | 'tertiary' | 'amber';
  className?: string;
  /**
   * When `false`, the trigger hides the OVR score (the player-card-style
   * number). Defaults to `true`. Sub / move pickers in the tactical
   * events panel can pass `false` to keep the row compact.
   */
  showOverall?: boolean;
  /**
   * When `false`, hides the GK / Outfielder role chip shown below the
   * player name in both the trigger and the popover list. Sub / move
   * pickers pass `false` since role is implicit (GK↔GK validation is
   * handled elsewhere and the chip adds noise).
   */
  showRole?: boolean;
}

export function PlayerSelect({
  value,
  onChange,
  players,
  placeholder,
  align = 'left',
  disabled = false,
  tone = 'primary',
  className = '',
  showOverall = true,
  showRole = true,
}: PlayerSelectProps) {
  const t = useTranslations('tactics.events');
  const ph = placeholder ?? t('selectPlayer');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    right: 0,
    openUpward: false,
  });

  const selected = useMemo(() => players.find((p) => p.id === value), [players, value]);
  const filtered = useMemo(() => {
    if (!query) return players;
    const q = query.toLowerCase();
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.displayId ?? '').toLowerCase().includes(q) ||
        (p.position ?? '').toLowerCase().includes(q),
    );
  }, [players, query]);

  // Position the popover under (or above) the trigger, with auto-flip so
  // it never gets clipped by the viewport bottom.
  const POPOVER_HEIGHT = 280;
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
      left: align === 'right' ? Math.max(8, rect.right - 248) : rect.left,
      right: align === 'right' ? Math.max(8, window.innerWidth - rect.right) : 0,
      openUpward,
    });
  }, [open, align]);

  // Close on outside click / Escape.
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

  const ringByTone: Record<NonNullable<PlayerSelectProps['tone']>, string> = {
    primary: 'border-primary bg-primary/15 text-primary',
    tertiary: 'border-tertiary bg-tertiary/15 text-tertiary',
    amber: 'border-amber-400 bg-amber-500/15 text-amber-300',
  };
  const focusRingByTone: Record<NonNullable<PlayerSelectProps['tone']>, string> = {
    primary: 'ring-primary/30 border-primary',
    tertiary: 'ring-tertiary/30 border-tertiary',
    amber: 'ring-amber-400/30 border-amber-400',
  };
  const focusIconByTone: Record<NonNullable<PlayerSelectProps['tone']>, string> = {
    primary: 'text-primary',
    tertiary: 'text-tertiary',
    amber: 'text-amber-400',
  };

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-all ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-outline-variant/20'
            : `cursor-pointer border-outline-variant/30 hover:border-primary/50 ${open ? `ring-2 ${focusRingByTone[tone]}` : ''}`
        } bg-surface-container/50`}
      >
        {selected ? (
          <div className={`flex-1 min-w-0 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
            <span className="text-xs font-bold text-white truncate w-full">{selected.name}</span>
            <div className={`flex items-center gap-1.5 mt-0.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
              {showRole && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-outline">
                  {selected.isGoalkeeper ? t('roleGk') : t('roleOutfielder')}
                </span>
              )}
              {showOverall && (
                <>
                  {showRole && <span className="w-0.5 h-0.5 rounded-full bg-outline-variant" />}
                  <span className={`text-[9px] font-bold ${selected.overall >= 80 ? 'text-emerald-400' : 'text-outline'}`}>
                    {t('overallLabel', { value: selected.overall })}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-outline">
            <span className="material-symbols-outlined text-[14px]">person</span>
            <span className="text-xs font-medium">{ph}</span>
          </div>
        )}
        {!disabled && (
          <span className={`material-symbols-outlined text-[14px] text-outline transition-transform ${open ? `rotate-180 ${focusIconByTone[tone]}` : ''}`}>
            expand_more
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={align === 'right'
            ? { top: pos.top, right: pos.right, width: 240 }
            : { top: pos.top, left: pos.left, width: 240 }}
          className="fixed z-50 max-h-[280px] flex flex-col rounded-lg border border-outline-variant/30 bg-surface-container-highest shadow-xl shadow-black/40"
        >
          <div className="p-1.5 border-b border-outline-variant/20">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container/60">
              <span className="material-symbols-outlined text-[14px] text-outline">search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="flex-1 bg-transparent text-xs text-white placeholder:text-outline focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] uppercase tracking-widest text-outline font-label">
                {t('noMatches')}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    value === p.id ? 'bg-primary/15 text-white' : 'text-on-surface hover:bg-surface-container/60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-extrabold font-headline shrink-0 ${
                      p.isGoalkeeper
                        ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                        : 'bg-primary/15 text-primary border border-primary/30'
                    }`}
                  >
                    {p.name.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{p.name}</div>
                    {showRole && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-outline">
                          {p.isGoalkeeper ? t('roleGk') : t('roleOutfielder')}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`font-headline font-black text-sm tabular-nums ${
                      p.overall >= 80 ? 'text-emerald-400' : 'text-on-surface-variant'
                    }`}
                  >
                    {p.overall}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
