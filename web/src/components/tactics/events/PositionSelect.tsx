'use client';

/**
 * PositionSelect — custom dropdown for picking a pitch slot in tactical
 * events. Inspired by `frontend/components/ui/PositionSelect.tsx`. Shows
 * the slot's short label + a "New Position" hint when selected; the
 * popover is a narrow list of every PITCH_SLOTS entry.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PITCH_SLOTS, type PitchSlot } from '../types';
import { positionShortLabel } from '../shared/position-legend';

export interface PositionSelectProps {
  value: string;
  onChange: (slot: PitchSlot) => void;
  align?: 'left' | 'right';
  disabled?: boolean;
  placeholder?: string;
}

export function PositionSelect({ value, onChange, align = 'left', disabled = false, placeholder }: PositionSelectProps) {
  const t = useTranslations('tactics.events');
  const ph = placeholder ?? t('selectPosition');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    right: 0,
    openUpward: false,
  });

  // Auto-flip: open downward if there's room, otherwise upward so the
  // popover is never clipped by the viewport bottom.
  const POPOVER_HEIGHT = 260;
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
      left: align === 'right' ? Math.max(8, rect.right - 144) : rect.left,
      right: align === 'right' ? Math.max(8, window.innerWidth - rect.right) : 0,
      openUpward,
    });
  }, [open, align]);

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

  return (
    <div className="relative" ref={triggerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-all ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-outline-variant/20'
            : `cursor-pointer border-outline-variant/30 hover:border-amber-400/60 ${open ? 'ring-2 ring-amber-400/30 border-amber-400' : ''}`
        } bg-surface-container/50`}
      >
        {value ? (
          <div className={`flex-1 min-w-0 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
            <span className="text-xs font-bold text-white">{positionShortLabel(value as PitchSlot)}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300/80">
              {t('newPosition')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-outline">
            <span className="material-symbols-outlined text-[14px]">open_with</span>
            <span className="text-xs font-medium">{ph}</span>
          </div>
        )}
        {!disabled && (
          <span className={`material-symbols-outlined text-[14px] text-outline transition-transform ${open ? 'rotate-180 text-amber-400' : ''}`}>
            expand_more
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={align === 'right'
            ? { top: pos.top, right: pos.right, width: 144 }
            : { top: pos.top, left: pos.left, width: 144 }}
          className="fixed z-50 max-h-[260px] flex flex-col rounded-lg border border-outline-variant/30 bg-surface-container-highest shadow-xl shadow-black/40"
        >
          <div className="overflow-y-auto p-1 space-y-0.5">
            {PITCH_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  onChange(slot);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs font-bold transition-colors ${
                  value === slot
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'text-on-surface hover:bg-surface-container/60'
                }`}
              >
                <span className="font-headline">{positionShortLabel(slot)}</span>
                {value === slot && (
                  <span className="material-symbols-outlined text-[12px] text-amber-400">check</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
