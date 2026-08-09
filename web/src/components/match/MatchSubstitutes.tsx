/**
 * MatchSubstitutes — read-only substitutes panel for the match report.
 *
 * Distinct from the `tactics/bench/BenchStrip` used on the line-up page,
 * which is drag-and-drop enabled. The match report is post-game: the
 * user wants to read what the bench looked like AND what actually
 * happened, not move players around.
 *
 * Two stacked sections per team:
 *
 *   ┌────────────────────────────────────────────┐
 *   │ SUBSTITUTES              SW1NG  ●  TEAM 3 ●│
 *   ├────────────────────────────────────────────┤
 *   │ Planned bench                              │
 *   │   GK   CB   FB    W   CM   FW             │
 *   │  [—] [Yang] [Liu] [P] [H] [Z]             │  ← per-slot card
 *   │  4.5  5.0   4.0  4.5 4.5 5.0 (OVR if any)  │
 *   ├────────────────────────────────────────────┤
 *   │ Used: 2                                    │
 *   │  45'  H.Peng → L.Liu                       │  ← substitution list
 *   │  72'  R.Wang → S.Schröder                  │     (only if any)
 *   └────────────────────────────────────────────┘
 *
 * All copy is i18n-ised under `matches.bento.substitutes.*`.
 */

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import type { MatchEvent, Player } from '@/lib/api';
import { BENCH_SLOTS } from '../tactics/types';
import type { BenchSlot } from '../tactics/types';

export interface MatchSubstitutesProps {
  homeTeamName: string;
  awayTeamName: string;
  /** Map of bench slot → player id, from submitted tactics. */
  homeBench: Partial<Record<BenchSlot, number>>;
  awayBench: Partial<Record<BenchSlot, number>>;
  homeRosterById: Map<number, Player>;
  awayRosterById: Map<number, Player>;
  /** Full event list — we filter for `typeName === 'substitution'`. */
  events: MatchEvent[];
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeColor?: string;
  awayColor?: string;
}

// Bench slots ordered by goalkeeper → forward (matches the lineup build).
const BENCH_ROWS: Array<{ key: BenchSlot; label: string; isGk: boolean }> = [
  { key: 'BENCH_GK', label: 'GK', isGk: true },
  { key: 'BENCH_CB', label: 'CB', isGk: false },
  { key: 'BENCH_FB', label: 'FB', isGk: false },
  { key: 'BENCH_W', label: 'W', isGk: false },
  { key: 'BENCH_CM', label: 'CM', isGk: false },
  { key: 'BENCH_FW', label: 'FW', isGk: false },
];

// Sanity: keep this in sync with the canonical BENCH_SLOTS order. If
// someone reorders the type module, throw early so the panel can't
// silently drop a slot.
if (BENCH_ROWS.length !== BENCH_SLOTS.length) {
  throw new Error(
    `MatchSubstitutes: bench row count (${BENCH_ROWS.length}) != BENCH_SLOTS length (${BENCH_SLOTS.length})`,
  );
}

const HOME_FALLBACK = '#00e479';
const AWAY_FALLBACK = '#ffdb9d';

interface SubsEvent {
  minute: number;
  side: 'home' | 'away' | 'neutral';
  /** Incoming player's display name (from data.substitutePlayerName / data.playerIn). */
  playerIn: string;
  /** Outgoing player's display name (from data.playerOut). */
  playerOut: string;
}

/**
 * Filter the full event list to the substitutions that actually
 * happened, attribute the side from `teamId` so the row picks up the
 * right tint.
 */
function extractSubstitutions(
  events: MatchEvent[],
  homeTeamId: string | null | undefined,
  awayTeamId: string | null | undefined,
): SubsEvent[] {
  const out: SubsEvent[] = [];
  for (const ev of events) {
    if ((ev.typeName ?? '').toLowerCase() !== 'substitution') continue;
    const side: 'home' | 'away' | 'neutral' =
      ev.teamId === homeTeamId
        ? 'home'
        : ev.teamId === awayTeamId
          ? 'away'
          : 'neutral';
    out.push({
      minute: ev.minute,
      side,
      playerIn:
        (ev.data?.substitutePlayerName as string | undefined) ??
        (ev.data?.playerIn as string | undefined) ??
        ev.playerId?.toString() ??
        '?',
      playerOut: (ev.data?.playerOut as string | undefined) ?? '?',
    });
  }
  return out;
}

interface SeatCardProps {
  label: string;
  isGk: boolean;
  player: Player | null;
  color: string;
}

function SeatCard({ label, isGk, player, color }: SeatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-md border bg-surface-container/30 px-1.5 py-1.5 min-w-0 flex flex-col items-center gap-0.5',
        isGk ? 'border-tertiary/30' : 'border-on-surface/5',
      )}
    >
      <span
        className={clsx(
          'font-headline font-bold text-[8px] tracking-widest uppercase',
          isGk ? 'text-tertiary/80' : 'text-on-surface-variant/60',
        )}
      >
        {label}
      </span>
      {player ? (
        <>
          <span
            className="font-headline font-black text-[10px] text-on-surface truncate w-full text-center"
            title={player.name}
          >
            {player.name.split(' ').pop()}
          </span>
          <span
            className="font-mono font-black tabular-nums text-[9px]"
            style={{ color }}
          >
            {Math.round(player.overall)}
          </span>
        </>
      ) : (
        <span className="font-headline text-[10px] text-on-surface-variant/30">—</span>
      )}
    </div>
  );
}

interface TeamBenchProps {
  teamName: string;
  bench: Partial<Record<BenchSlot, number>>;
  rosterById: Map<number, Player>;
  subs: SubsEvent[];
  color: string;
  t: ReturnType<typeof useTranslations<'matches.bento.substitutes'>>;
}

function TeamBench({ teamName, bench, rosterById, subs, color, t }: TeamBenchProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span
          className="font-headline font-bold text-[10px] uppercase tracking-widest truncate"
          style={{ color }}
        >
          {teamName}
        </span>
        <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50 shrink-0 ml-2">
          {t('used', { count: subs.length })}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {BENCH_ROWS.map(({ key, label, isGk }) => {
          const playerId = bench[key];
          const player = playerId != null ? rosterById.get(playerId) ?? null : null;
          return (
            <SeatCard key={key} label={label} isGk={isGk} player={player} color={color} />
          );
        })}
      </div>
      {subs.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {subs.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[10px] font-mono"
            >
              <span
                className="font-headline font-black tabular-nums text-[9px] shrink-0"
                style={{ color }}
              >
                {s.minute}&apos;
              </span>
              <span
                className="w-1 h-1 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-headline text-[10px] text-on-surface truncate">
                <span className="font-bold">{s.playerIn}</span>
                <span className="text-on-surface-variant/40 mx-1">←</span>
                <span className="text-on-surface-variant/70">{s.playerOut}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchSubstitutes({
  homeTeamName,
  awayTeamName,
  homeBench,
  awayBench,
  homeRosterById,
  awayRosterById,
  events,
  homeTeamId,
  awayTeamId,
  homeColor = HOME_FALLBACK,
  awayColor = AWAY_FALLBACK,
}: MatchSubstitutesProps) {
  const t = useTranslations('matches.bento.substitutes');

  const allSubs = extractSubstitutions(events, homeTeamId, awayTeamId);
  const homeSubs = allSubs.filter((s) => s.side === 'home');
  const awaySubs = allSubs.filter((s) => s.side === 'away');

  return (
    <div className="glass-panel rounded-2xl p-4">
      <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base">groups</span>
        {t('title')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamBench
          teamName={homeTeamName}
          bench={homeBench}
          rosterById={homeRosterById}
          subs={homeSubs}
          color={homeColor}
          t={t}
        />
        <TeamBench
          teamName={awayTeamName}
          bench={awayBench}
          rosterById={awayRosterById}
          subs={awaySubs}
          color={awayColor}
          t={t}
        />
      </div>
    </div>
  );
}
