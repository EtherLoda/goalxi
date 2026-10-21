'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon, type MaterialIconName } from '@/components/icons/AppIcon';
import { Tooltip } from '@/components/ui/Tooltip';

export type FormResult = 'W' | 'D' | 'L' | 'pending';

/**
 * Turns one chip into a link with a hover card. Optional per chip: a fixture
 * that has not been played has nothing to link to, and the match-list header
 * uses the strip without any links at all.
 */
export interface FormChipLink {
  href: string;
  /** First line of the bubble: the fixture, score already in place. */
  fixture: string;
  /** Second line: the date it was played. */
  date?: string;
}

interface FormChipStripProps {
  /** Up to 5 most-recent results, oldest first or newest first (chip order preserved). */
  results: FormResult[];
  /** When provided, the last chip is highlighted as "latest". */
  highlightLatest?: boolean;
  /**
   * `letter` prints W/D/L, `glyph` prints a tick / cross / dash. The glyph
   * form exists because a dense table column of single letters reads as
   * three nearly identical blobs at 20px, while a tick and a cross are
   * distinguishable from across the room.
   */
  variant?: 'letter' | 'glyph';
  size?: 'md' | 'sm';
  /** One entry per result, same order. `null` leaves that chip unlinked. */
  links?: ReadonlyArray<FormChipLink | null | undefined>;
}

const GLYPHS: Record<Exclude<FormResult, 'pending'>, MaterialIconName> = {
  W: 'check',
  D: 'remove',
  L: 'close',
};

/**
 * Stadium scoreboard-style form chip strip used in the match list header.
 * Pure visual primitive; doesn't fetch or compute results itself.
 */
export function FormChipStrip({
  results,
  highlightLatest = true,
  variant = 'letter',
  size = 'md',
  links,
}: FormChipStripProps) {
  const t = useTranslations('matches.kpi');

  const glyph = variant === 'glyph';

  return (
    <div className={clsx('flex items-center', size === 'sm' ? 'gap-1' : 'gap-1.5')}>
      {results.map((r, i) => {
        const isLatest = highlightLatest && i === results.length - 1;
        const link = links?.[i] ?? null;

        const chip = (
          <div
            className={clsx(
              'flex items-center justify-center font-headline font-black transition-all',
              size === 'sm'
                ? 'h-5 w-5 rounded text-[10px]'
                : 'h-9 w-9 rounded-lg text-xs border',
              // A filled chip carries no border: the fill is the signal, and a
              // ring on a saturated red reads as a second, unrelated state.
              r === 'W' &&
                (glyph
                  ? 'bg-primary text-on-primary'
                  : 'bg-primary text-on-primary border-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]'),
              r === 'D' && 'bg-white/10 text-on-surface-variant',
              r === 'D' && !glyph && 'border-white/10',
              r === 'L' &&
                (glyph ? 'bg-error-dim text-white' : 'bg-error/10 text-error border-error/30'),
              r === 'pending' && 'bg-white/5 text-on-surface-variant',
              isLatest && !glyph && r === 'W' && 'scale-110',
              isLatest && !glyph && r === 'L' && 'scale-110',
            )}
          >
            {glyph && r !== 'pending' ? (
              <AppIcon name={GLYPHS[r]} className="text-[12px]" />
            ) : r === 'pending' ? (
              '·'
            ) : (
              r
            )}
          </div>
        );

        if (!link) {
          return (
            <span key={i} title={t(r === 'pending' ? 'formEmpty' : r)}>
              {chip}
            </span>
          );
        }

        return (
          <Link
            key={i}
            href={link.href}
            aria-label={link.date ? `${link.fixture} · ${link.date}` : link.fixture}
            className="inline-flex transition-transform hover:-translate-y-0.5"
          >
            <Tooltip
              side="bottom"
              align="end"
              label={
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold tracking-normal">
                    {link.fixture}
                  </span>
                  {link.date && (
                    <span className="text-[10px] font-normal tracking-normal opacity-70">
                      {link.date}
                    </span>
                  )}
                </span>
              }
            >
              {chip}
            </Tooltip>
          </Link>
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
