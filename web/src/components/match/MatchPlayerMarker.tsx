'use client';

import React from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { Player } from '@/lib/api';
import { ratingGrade } from '@/lib/rating-grade';
import { positionShortLabel } from '../tactics/shared/position-legend';
import type { PitchSlot } from '../tactics/types';

/**
 * How a player is drawn on the match pitch.
 *
 * - `lineup` — portrait and name only. This is the "who is on the pitch"
 *   read: at a glance you see the shape and the names, nothing that needs
 *   interpreting.
 * - `rating` — adds the two numbers that describe how each player is
 *   doing right now: condition (1–5, the circle) and rating (a letter grade).
 *
 * The two are modes of ONE pitch rather than two different renders, so the
 * players never move between them — flipping the toggle changes what is
 * printed, not who is where.
 */
export type PitchMarkerMode = 'lineup' | 'rating' | 'grid';

interface MatchPlayerMarkerProps {
  player: Player;
  slot: PitchSlot;
  isGkSlot: boolean;
  mode?: PitchMarkerMode;
  isSelected?: boolean;
  /**
   * The player is one of the names on the commentary line the reader
   * selected (scorer + assister, the booked player, the interceptor…).
   * Drawn as a halo + glow so the reader can find them on the pitch
   * without hunting for the shirt number.
   */
  isHighlighted?: boolean;
  isDragging?: boolean;
  isSubstitute?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Fitness factor 0–1 from ConditionSystem */
  snapshotFitness?: number;
  /** Power rating 0–20 from engine (`sr`) */
  snapshotStarRating?: number;
}

const DRAG_MIME = 'application/x-goalxi-player';
const AVATAR_SIZE = 46;

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Condition band, matching the club-colour semantics used elsewhere. */
function conditionTone(fitness: number): string {
  if (fitness >= 0.9) return '#22c55e';
  if (fitness >= 0.7) return '#84cc16';
  if (fitness >= 0.5) return '#eab308';
  if (fitness >= 0.3) return '#f97316';
  return '#ef4444';
}

/**
 * The rating badge: a letter, not stars.
 *
 * A 0–20+ engine value squeezed into five stars threw away fifteen of its
 * sixteen steps, and every starter above ~5 came out as five full stars. The
 * letter ladder keeps the resolution and still sorts at a glance. The number
 * itself is never printed — the grade is the whole message.
 */
function RatingBadge({ power }: { power: number }) {
  const { letter, tone } = ratingGrade(power);
  return (
    <span
      className={`mt-1 inline-flex min-w-[24px] items-center justify-center rounded-[5px] px-1.5 py-[1px] text-[13px] font-black leading-none tracking-tight ${tone}`}
      style={{
        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent)',
      }}
      title={letter}
      aria-label={letter}
    >
      {letter}
    </span>
  );
}

export function MatchPlayerMarker({
  player,
  slot,
  isGkSlot,
  mode = 'lineup',
  isSelected = false,
  isHighlighted = false,
  isDragging = false,
  isSubstitute = false,
  onClick,
  onRemove,
  onDragStart,
  onDragEnd,
  snapshotFitness,
  snapshotStarRating,
}: MatchPlayerMarkerProps) {
  const fitness =
    snapshotFitness !== undefined
      ? Math.max(0, Math.min(1, snapshotFitness))
      : Math.max(0, Math.min(1, player.stamina / 5));

  const overall = (player as unknown as Record<string, unknown>).overall as number | undefined;
  // The engine's `sr` is the 0–20+ power rating the letter ladder is written
  // for; the match engine divides position fit by 5 to reach this scale.
  // Older cards have no snapshot at all (pre-match), so fall back to overall,
  // which sits around 20–40 in this world — `overall / 5` lands on the same
  // scale as `sr`.
  const power =
    snapshotStarRating !== undefined
      ? Math.max(0, snapshotStarRating)
      : Math.max(0, (overall ?? 10) / 5);

  const tone = conditionTone(fitness);
  // 体能 is shown as the share of the tank still in the player, not the
  // 1-5 integer the squad page uses: on the pitch the interesting question
  // is "how much is left", and a ring answers it without reading a number.
  const pct = Math.round(fitness * 100);
  const ringPad = 5;
  const ringBox = AVATAR_SIZE + ringPad * 2;
  const ringCenter = ringBox / 2;
  const ringRadius = AVATAR_SIZE / 2 + ringPad - 1.5;
  const ringLength = 2 * Math.PI * ringRadius;
  return (
    <div
      className={`group relative flex flex-col items-center select-none transition-all duration-base ${
        isDragging ? 'opacity-30 scale-90' : ''
      } ${isSelected ? 'scale-110' : ''} ${isSubstitute ? 'animate-pulse' : ''}`}
      data-highlighted={isHighlighted ? 'true' : undefined}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="img"
      aria-label={
        mode === 'rating'
          ? `${player.name} — ${positionShortLabel(slot)} — 体能 ${pct}%`
          : `${player.name} — ${positionShortLabel(slot)}`
      }
      title={mode === 'rating' ? `${player.name} · 体能剩余 ${pct}%` : player.name}
    >
      <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        {/* Selected-event halo. The reader picked a commentary line and the
            pitch answers "which of these 22 is it" — a slow pulse so the eye
            finds it without the marker shouting over the scoreline. Behind
            the avatar (z-10) so initials and the stamina ring stay legible.
            Always mounted: the live feed lights a player for a few seconds
            while the remark types out, and the fade is part of telling the
            reader that window closed (pulse only while lit, otherwise the
            animation and `opacity-0` fight each other). */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-1.5 rounded-full bg-primary/15 ring-2 ring-primary/70 transition-opacity duration-500 ${
            isHighlighted ? 'opacity-100 animate-pulse motion-reduce:animate-none' : 'opacity-0'
          }`}
          style={{
            animationDuration: '2.4s',
            boxShadow: '0 0 18px 4px rgba(0, 228, 121, 0.3)',
          }}
        />
        <div
          className={`relative z-10 flex h-full w-full items-center justify-center rounded-full font-headline text-label font-extrabold uppercase ${
            isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-ink-750' : ''
          }`}
          style={{
            background: '#0d1f17',
            border: `2px solid ${mode === 'rating' ? 'rgba(255,255,255,0.14)' : 'rgba(0,228,121,0.45)'}`,
            color: isGkSlot ? 'rgba(168,85,247,0.95)' : 'rgba(226,232,240,0.92)',
          }}
        >
          {initials(player.name)}
        </div>

        {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1 -top-1 z-30 hidden h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-float text-on-surface/70 group-hover:flex"
          aria-label="Remove player"
        >
          <AppIcon name="close" className="text-[10px]" />
        </button>
      )}

        {/* Remaining-stamina ring: a full circle reads 100% and the arc
            shortens as the player empties. Behind the avatar so the
            initials stay legible. */}
        {mode === 'rating' && (
          <svg
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
            width={ringBox}
            height={ringBox}
            viewBox={`0 0 ${ringBox} ${ringBox}`}
            aria-hidden="true"
          >
            <circle cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={3} />
            <circle cx={ringCenter} cy={ringCenter} r={ringRadius} fill="none" stroke={tone} strokeWidth={3} strokeLinecap="round" strokeDasharray={ringLength} strokeDashoffset={ringLength * (1 - fitness)} transform={`rotate(-90 ${ringCenter} ${ringCenter})`} />
          </svg>
        )}
      </div>

      <div className="mt-1 flex w-full flex-col items-center leading-none">
        <span
          className={`max-w-[102px] truncate text-center font-headline text-[13px] font-semibold ${
            isHighlighted ? 'text-primary' : 'text-on-surface/90'
          }`}
        >
          {player.name}
        </span>
        {mode === 'rating' && <RatingBadge power={power} />}
      </div>
    </div>
  );
}
