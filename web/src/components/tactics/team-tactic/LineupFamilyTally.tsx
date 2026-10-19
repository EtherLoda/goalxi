'use client';

/**
 * LineupFamilyTally.tsx — how many of each position family are on the pitch.
 *
 * This is the number the deployment gate is actually made of, so it is
 * rendered as a live readout next to the picker rather than as a tooltip.
 * `aria-live="polite"` because dragging a player changes it and a screen
 * reader user gets no other signal that a requirement flipped from unmet to
 * met.
 *
 * Families the current tactic asks for are emphasised; the rest stay muted.
 * On an eleven-man lineup every family has some count, so "which of these
 * numbers matters" is the only question the strip answers.
 */
import { motion } from 'motion/react';
import type { PositionFamilyCode } from '@/lib/api';
import type { FamilyTally } from './requirement';
import { DURATION, EASE } from '@/lib/motion';

export interface LineupFamilyTallyProps {
  tally: FamilyTally;
  familyOrder: readonly PositionFamilyCode[];
  /** Families the selected tactic requires; may be empty. */
  needed: ReadonlySet<PositionFamilyCode>;
}

export function LineupFamilyTally({
  tally,
  familyOrder,
  needed,
}: LineupFamilyTallyProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {familyOrder
        .filter((family) => family !== 'GK')
        .map((family) => {
          const isNeeded = needed.has(family);
          const count = tally[family];
          return (
            <span
              key={family}
              className={
                'inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums transition-colors duration-quick ' +
                (isNeeded
                  ? 'bg-primary/12 text-primary'
                  : 'bg-white/4 text-on-surface-variant/70')
              }
            >
              <span className="font-semibold">{family}</span>
              {/* Only the counter that actually changed replays the pop: the
                  key embeds the value, so an unchanged family keeps its
                  element and the drag of one player does not animate the
                  other seven numbers. */}
              <motion.span
                key={count}
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: DURATION.quick, ease: EASE.spring }}
                className="inline-block"
              >
                {count}
              </motion.span>
            </span>
          );
        })}
    </div>
  );
}
