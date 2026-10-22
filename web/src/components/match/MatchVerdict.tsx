'use client';

/**
 * MatchVerdict — one line explaining how the match was decided, plus the
 * three-lane bar that shows where it happened.
 *
 * Both halves read the same `VerdictInput`, so the sentence and the bars can
 * never disagree: whatever the sentence calls the decisive lane is the lane
 * drawn to its full extent.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { GlassPanel } from '@/components/ui/GlassPanel';
import {
  deriveVerdict,
  laneBars,
  type LaneBar,
  type VerdictInput,
  type VerdictSide,
} from './match-verdict';

export interface MatchVerdictProps {
  home: VerdictSide;
  away: VerdictSide;
  className?: string;
}

export function MatchVerdict({ home, away, className }: MatchVerdictProps) {
  const t = useTranslations('matches.verdict');

  const input: VerdictInput = useMemo(() => ({ home, away }), [home, away]);
  const sentence = useMemo(() => deriveVerdict(input), [input]);
  const bars = useMemo(() => laneBars(input), [input]);

  return (
    <GlassPanel className={`p-4 ${className ?? ''}`} data-testid="match-verdict">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="min-w-0 lg:flex-1">
          <p className="text-kicker font-headline uppercase tracking-widest text-primary/70 mb-1">
            {t('title')}
          </p>
          <p className="font-headline text-title text-on-surface leading-snug">
            {t(sentence.key, sentence.params)}
          </p>
          <p className="mt-1 text-label text-on-surface-variant tabular-nums">
            {t('possessionShort', {
              home: Math.round(home.possessionPct),
              away: Math.round(away.possessionPct),
            })}
            <span className="mx-2 text-outline">·</span>
            {t('onTargetShort', {
              home: home.shotsOnTarget,
              away: away.shotsOnTarget,
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:w-[360px]">
          {bars.map((bar) => (
            <LaneRow key={bar.lane} bar={bar} label={t(`lane.${bar.lane}`)} />
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}

function LaneRow({ bar, label }: { bar: LaneBar; label: string }) {
  const homePct = Math.round(bar.homeShare * 100);
  const ahead = bar.net > 0 ? 'home' : bar.net < 0 ? 'away' : null;

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-kicker font-headline text-on-surface-variant">
        {label}
      </span>
      <span
        className={`w-8 shrink-0 text-right font-headline text-kicker tabular-nums ${
          ahead === 'home' ? 'text-primary' : 'text-on-surface-variant/70'
        }`}
      >
        {bar.homeAttack.toFixed(1)}
      </span>

      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
        aria-hidden="true"
      >
        {/* Home fills from the centre leftwards, away from the centre
            rightwards — the midpoint is the "level" line, not the start. */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/80 transition-[width] duration-base"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-signal-amber/70 transition-[width] duration-base"
          style={{ width: `${100 - homePct}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-surface-container-lowest/70" />
      </div>

      <span
        className={`w-8 shrink-0 font-headline text-kicker tabular-nums ${
          ahead === 'away' ? 'text-signal-amber' : 'text-on-surface-variant/70'
        }`}
      >
        {bar.awayAttack.toFixed(1)}
      </span>
    </div>
  );
}
