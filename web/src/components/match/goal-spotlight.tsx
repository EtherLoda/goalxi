/**
 * goal-spotlight.tsx — large centre-stage card for "the moment" events.
 *
 * Replaces the old single-line "+1 GOAL 23'" text. Shows up to four
 * different layouts depending on the canonical event type:
 *
 *   - GOAL              → score, scorer, assist, probability, attack/defense
 *                          score, mini-pitch shot marker
 *   - RED_CARD / 2ND_YELLOW → player, reason chip, score
 *   - SUBSTITUTION      → out → in
 *   - HALF_TIME / FULL_TIME / KICKOFF / 2ND HALF → period banner
 *
 * Falls back to a quiet "watching" panel (current minute + score)
 * when there are no spotlight-worthy events yet.
 */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType } from '@/lib/commentary';
import {
  GoalIcon,
  RedCardIcon,
  YellowCardIcon,
  SubstitutionIcon,
  PeriodMarkerIcon,
  KickoffIcon,
} from './commentary-icons';

export interface GoalSpotlightProps {
  /** Latest spotlight-worthy event (or null). */
  event: MatchEvent | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  /** Hex strings from team entity (jersey_color_primary). Optional. */
  homeColor?: string | null;
  awayColor?: string | null;
  currentMinute: number;
}

// ── Mini pitch with shot marker ──────────────────────────────────────────
const MiniPitch: React.FC<{ lane?: string; isHome: boolean }> = ({ lane, isHome }) => {
  // We mirror the home attack direction: home shoots toward y=0, away
  // toward y=100. The dot sits where the shot originated (assumed mid
  // third — exactly which third isn't in the data, so we default center).
  const x = lane === 'left' ? 30 : lane === 'right' ? 70 : 50;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden>
      <rect x="2" y="2" width="96" height="96" rx="2" fill="#0e4d25" stroke="#fff" strokeOpacity="0.4" />
      <line x1="2" y1="50" x2="98" y2="50" stroke="#fff" strokeOpacity="0.4" />
      <circle cx="50" cy="50" r="9" fill="none" stroke="#fff" strokeOpacity="0.4" />
      <rect x="22" y={isHome ? 2 : 80} width="56" height="15" fill="none" stroke="#fff" strokeOpacity="0.4" />
      {/* shot origin */}
      <circle cx={x} cy={isHome ? 70 : 30} r="3.5" fill="#fbbf24" stroke="#000" strokeOpacity="0.6" strokeWidth="0.6" />
      {/* arrow toward goal */}
      <line
        x1={x}
        y1={isHome ? 70 : 30}
        x2={x}
        y2={isHome ? 12 : 88}
        stroke="#fbbf24"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
    </svg>
  );
};

const TeamBadge: React.FC<{ name: string; color?: string | null; side: 'H' | 'A' }> = ({ name, color, side }) => (
  <div className="flex items-center gap-2">
    <div
      className="w-10 h-10 rounded-full grid place-items-center text-xs font-headline font-black text-white shadow-md"
      style={{ background: color ?? (side === 'H' ? '#3b82f6' : '#ef4444') }}
    >
      {side}
    </div>
    <div className="text-xs font-headline uppercase tracking-widest text-on-surface-variant truncate max-w-[100px]">
      {name}
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string | number; tone?: 'good' | 'bad' | 'neutral' }> = ({ label, value, tone = 'neutral' }) => {
  const toneCls =
    tone === 'good'
      ? 'text-primary'
      : tone === 'bad'
      ? 'text-error'
      : 'text-on-surface';
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-headline uppercase tracking-widest text-on-surface-variant">{label}</span>
      <span className={`text-base font-mono font-black tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
};

export const GoalSpotlight: React.FC<GoalSpotlightProps> = ({
  event,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  homeColor,
  awayColor,
  currentMinute,
}) => {
  const tChrome = useTranslations('matches.live');

  if (!event) {
    return (
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest/40 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-headline uppercase tracking-widest">
            {tChrome('watching', { minute: currentMinute })}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono">
          <span className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant truncate max-w-[80px]">{homeTeamName}</span>
          <span className="font-black text-lg tabular-nums">{homeScore} - {awayScore}</span>
          <span className="font-headline text-[10px] uppercase tracking-widest text-on-surface-variant truncate max-w-[80px]">{awayTeamName}</span>
        </div>
      </div>
    );
  }

  const type = canonicalEventType(event.typeName ?? event.type);
  const isHome = event.isHome ?? false;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const teamName = isHome ? homeTeamName : awayTeamName;
  const teamColor = isHome ? homeColor : awayColor;

  // ── Period banner ───────────────────────────────────────────────────
  if (
    type === 'KICKOFF' || type === 'SECOND_HALF_START' || type === 'HALF_TIME' ||
    type === 'FULL_TIME' || type === 'EXTRA_TIME_START' || type === 'PENALTY_START' || type === 'FORFEIT'
  ) {
    const labels: Record<string, string> = {
      KICKOFF: tChrome('period.kickoff'),
      SECOND_HALF_START: tChrome('period.secondHalf'),
      HALF_TIME: tChrome('period.halfTime'),
      FULL_TIME: tChrome('period.fullTime'),
      EXTRA_TIME_START: tChrome('period.extraTime'),
      PENALTY_START: tChrome('period.penalties'),
      FORFEIT: tChrome('period.forfeit'),
    };
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4 flex items-center gap-3">
        <span className="text-primary">
          {type === 'KICKOFF' ? <KickoffIcon size={28} /> : <PeriodMarkerIcon size={28} />}
        </span>
        <div>
          <p className="font-headline font-black text-primary uppercase tracking-widest text-sm">
            {labels[type] ?? type}
          </p>
          <p className="text-on-surface-variant text-xs font-mono">
            {event.minute}&apos; · {homeTeamName} {homeScore} - {awayScore} {awayTeamName}
          </p>
        </div>
      </div>
    );
  }

  // ── GOAL ─────────────────────────────────────────────────────────────
  if (type === 'GOAL') {
    const probRaw = num(data?.probability);
    const atkRaw = num(data?.attackScore);
    const defRaw = num(data?.defenseScore);
    const scorer = str(data?.playerName) ?? str(data?.scorer) ?? '—';
    const assist = str(data?.assistName) ?? str(data?.assist) ?? null;
    const prob = probRaw != null ? Math.round(probRaw * 100) : null;
    const atk = atkRaw != null ? atkRaw.toFixed(1) : null;
    const def = defRaw != null ? defRaw.toFixed(1) : null;
    const lane = str(data?.lane) ?? undefined;
    return (
      <div className="rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary/15 via-surface-container to-surface-container-lowest overflow-hidden shadow-[0_0_24px_-4px_rgba(0,228,121,0.4)]">
        <div className="px-5 py-3 flex items-center justify-between border-b border-primary/20">
          <div className="flex items-center gap-2">
            <span className="text-primary animate-bounce"><GoalIcon size={24} /></span>
            <p className="font-headline font-black text-primary uppercase tracking-widest text-sm">
              {tChrome('goalTitle')} · {event.minute}&apos;
            </p>
          </div>
          <p className="font-mono font-black text-2xl tabular-nums text-primary">
            {homeScore} - {awayScore}
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-center px-5 py-4">
          <TeamBadge name={teamName} color={teamColor} side={isHome ? 'H' : 'A'} />
          <div className="text-center min-w-[140px]">
            <p className="font-headline text-2xl font-black text-on-surface leading-tight">{scorer}</p>
            {assist && (
              <p className="text-xs text-on-surface-variant mt-1 font-headline uppercase tracking-widest">
                {tChrome('assist')} · {assist}
              </p>
            )}
          </div>
          <div className="w-20 h-20 mx-auto">
            <MiniPitch lane={lane} isHome={isHome} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-primary/20 px-5 py-2.5">
          <Stat label={tChrome('goalProbability')} value={prob != null ? `${prob}%` : '—'} tone="good" />
          <Stat label={tChrome('attackScore')} value={atk ?? '—'} tone="good" />
          <Stat label={tChrome('defenseScore')} value={def ?? '—'} tone="bad" />
        </div>
      </div>
    );
  }

  // ── Red card / Second yellow ─────────────────────────────────────────
  if (type === 'RED_CARD' || type === 'SECOND_YELLOW') {
    const player = str(data?.playerName) ?? '—';
    return (
      <div className="rounded-2xl border-2 border-error/50 bg-error/5 px-5 py-4 flex items-center gap-4">
        <span className="text-error">
          {type === 'RED_CARD' ? <RedCardIcon size={32} /> : <YellowCardIcon size={32} />}
        </span>
        <div className="flex-1">
          <p className="font-headline font-black text-error uppercase tracking-widest text-sm">
            {type === 'SECOND_YELLOW' ? tChrome('secondYellow') : tChrome('redCard')}
            {' · '}
            {event.minute}&apos;
          </p>
          <p className="text-on-surface text-sm font-medium mt-0.5">
            {player} <span className="text-on-surface-variant font-headline text-xs">· {teamName}</span>
          </p>
        </div>
        <p className="font-mono font-black text-lg tabular-nums text-on-surface">
          {homeScore} - {awayScore}
        </p>
      </div>
    );
  }

  // ── Substitution ─────────────────────────────────────────────────────
  if (type === 'SUBSTITUTION') {
    const out = str(data?.playerOut) ?? str(data?.out) ?? '—';
    const inn = str(data?.playerIn) ?? str(data?.in) ?? '—';
    return (
      <div className="rounded-2xl border border-blue-400/40 bg-blue-400/5 px-5 py-3.5 flex items-center gap-3">
        <span className="text-blue-400"><SubstitutionIcon size={24} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-headline font-black text-blue-400 uppercase tracking-widest text-xs">
            {tChrome('substitution')} · {event.minute}&apos;
          </p>
          <p className="text-on-surface text-sm mt-0.5">
            <span className="text-on-surface-variant">{out}</span>
            <span className="text-on-surface-variant mx-1.5">→</span>
            <span className="font-medium">{inn}</span>
          </p>
        </div>
      </div>
    );
  }

  return null;
};
