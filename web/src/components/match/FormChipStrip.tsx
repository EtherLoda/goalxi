'use client';

import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

export type FormResult = 'W' | 'D' | 'L' | 'pending';

interface FormChipStripProps {
  /** Up to 5 most-recent results, oldest first or newest first (chip order preserved). */
  results: FormResult[];
  /** When provided, the last chip is highlighted as "latest". */
  highlightLatest?: boolean;
}

/**
 * Stadium scoreboard-style form chip strip used in the match list header.
 * Pure visual primitive; doesn't fetch or compute results itself.
 */
export function FormChipStrip({ results, highlightLatest = true }: FormChipStripProps) {
  const t = useTranslations('matches.kpi');

  return (
    <div className="flex items-center gap-1.5">
      {results.map((r, i) => {
        const isLatest = highlightLatest && i === results.length - 1;
        return (
          <div
            key={i}
            className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center font-headline font-black text-xs border transition-all',
              r === 'W' &&
                'bg-primary text-on-primary border-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]',
              r === 'D' &&
                'bg-white/5 text-on-surface-variant border-white/10',
              r === 'L' &&
                'bg-error/10 text-error border-error/30',
              r === 'pending' &&
                'bg-white/5 text-on-surface-variant border-white/10',
              isLatest && r === 'W' && 'scale-110',
              isLatest && r === 'L' && 'scale-110',
            )}
          >
            {r === 'pending' ? '·' : r}
          </div>
        );
      })}
      {results.length === 0 && (
        <span className="text-xs text-on-surface-variant font-label uppercase tracking-widest">
          {t('formEmpty')}
        </span>
      )}
    </div>
  );
}
