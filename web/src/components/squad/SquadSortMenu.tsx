'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import {
  findSortOption,
  nextSort,
  SKILL_SORT_OPTIONS,
  STAT_SORT_OPTIONS,
  type SortOption,
  type SquadSort,
  type SquadSortKey,
} from '@/components/squad/squad-sort';

interface SquadSortMenuProps {
  sort: SquadSort;
  onChange: (sort: SquadSort) => void;
}

/**
 * Sort control for the squad list.
 *
 * A dropdown rather than a segmented control: there are nineteen dimensions
 * and only one is active at a time, which is exactly the shape a menu
 * describes and a segmented control does not. Clicking the active option
 * again reverses it, so there is no second ascending/descending widget.
 */
export function SquadSortMenu({ sort, onChange }: SquadSortMenuProps) {
  const t = useTranslations('squad');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = findSortOption(sort.key);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (key: SquadSortKey) => {
    onChange(nextSort(sort, key));
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 items-center gap-1 rounded-lg px-1.5 font-label text-kicker font-bold transition-colors ${
          open
            ? 'bg-white/[0.06] text-on-surface'
            : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface'
        }`}
      >
        <AppIcon name="swap_vert" className="text-[13px] text-outline" />
        <span className="max-w-[104px] truncate">{t(active.labelKey)}</span>
        <span className="text-[10px] text-outline">{sort.direction === -1 ? '↓' : '↑'}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('sort.label')}
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-high/95 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md"
        >
          <div className="custom-scrollbar max-h-[300px] overflow-y-auto py-1">
            <SortSection
              title={t('sort.groupStatus')}
              options={STAT_SORT_OPTIONS}
              sort={sort}
              onPick={pick}
            />
            <SortSection
              title={t('sort.groupSkills')}
              options={SKILL_SORT_OPTIONS}
              sort={sort}
              onPick={pick}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SortSection({
  title,
  options,
  sort,
  onPick,
}: {
  title: string;
  options: readonly SortOption[];
  sort: SquadSort;
  onPick: (key: SquadSortKey) => void;
}) {
  const t = useTranslations('squad');

  return (
    <div className="px-1">
      <div className="px-1.5 py-1 font-label text-[10px] uppercase tracking-[0.14em] text-outline">
        {title}
      </div>
      {options.map((option) => {
        const isActive = option.key === sort.key;
        return (
          <button
            key={option.key}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            onClick={() => onPick(option.key)}
            className={`flex h-8 w-full items-center justify-between rounded-lg px-1.5 text-left font-label text-label transition-colors ${
              isActive
                ? 'bg-primary/10 font-bold text-primary'
                : 'text-on-surface-variant hover:bg-white/[0.05] hover:text-on-surface'
            }`}
          >
            <span className="truncate">{t(option.labelKey)}</span>
            {isActive && (
              <span className="text-kicker tabular-nums">
                {sort.direction === -1 ? '↓' : '↑'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
