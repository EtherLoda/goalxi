'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { Player } from '@/lib/api';
import { positionShortLabel } from '../tactics/shared/position-legend';
import type { PitchSlot } from '../tactics/types';

/**
 * How a player is drawn on the match pitch.
 *
 * - `lineup` — portrait and name only. This is the "who is on the pitch"
 *   read: at a glance you see the shape and the names, nothing that needs
 *   interpreting.
 * - `rating` — adds the two numbers that describe how each player is
 *   doing right now: condition (1–5, the circle) and rating (0–5 stars).
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
  isDragging?: boolean;
  isSubstitute?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Fitness factor 0–1 from ConditionSystem */
  snapshotFitness?: number;
  /** Power rating 0–20 from engine */
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

/** Half-star steps, like the ratings a match report prints. */
function StarRow({ stars }: { stars: number }) {
  return (
    <div className="mt-0.5 flex items-center gap-px" aria-label={`${stars.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span key={i} className="relative" style={{ width: 9, height: 9 }}>
            <Star
              size={9}
              strokeWidth={1.5}
              className="absolute inset-0 text-on-surface/25"
              aria-hidden="true"
            />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star
                  size={9}
                  strokeWidth={1.5}
                  fill="currentColor"
                  className="text-on-surface/90"
                  aria-hidden="true"
                />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function MatchPlayerMarker({
  player,
  slot,
  isGkSlot,
  mode = 'lineup',
  isSelected = false,
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
  const power =
    snapshotStarRating !== undefined
      ? Math.max(0, Math.min(20, snapshotStarRating))
      : Math.max(0, Math.min(20, (overall ?? 10) / 5));

  const tone = conditionTone(fitness);
  // Condition prints as a 1–5 integer, the way the rest of the UI talks
  // about 体能. `Math.max(1, …)` so a spent player reads 1, never 0.
  const condition = Math.max(1, Math.round(fitness * 5));
  // Engine power rating is 0–20; the pitch prints it as 0–5 stars.
  const stars = Math.round((power / 4) * 2) / 2;

  return (
    <div
      className={`group relative flex flex-col items-center select-none transition-all duration-base ${
        isDragging ? 'opacity-30 scale-90' : ''
      } ${isSelected ? 'scale-110' : ''} ${isSubstitute ? 'animate-pulse' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="img"
      aria-label={
        mode === 'rating'
          ? `${player.name} — ${positionShortLabel(slot)} — 体能 ${condition}, 评分 ${stars}`
          : `${player.name} — ${positionShortLabel(slot)}`
      }
      title={
        mode === 'rating'
          ? `${player.name} · 体能 ${condition}/5 · 评分 ${stars.toFixed(1)}/5`
          : player.name
      }
    >
      <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        <div
          className={`relative z-10 flex h-full w-full items-center justify-center rounded-full font-headline text-label font-extrabold uppercase ${
            isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-ink-750' : ''
          }`}
          style={{
            background: '#0d1f17',
            border: `2px solid ${mode === 'rating' ? tone : 'rgba(0,228,121,0.45)'}`,
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

      {/* Condition badge sitting on the rim, like a squad-number badge. */}
        {mode === 'rating' && (
          <span
            className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full px-1.5 font-headline text-kicker font-black tabular-nums"
            style={{ background: tone, color: '#07140d' }}
          >
            {condition}
          </span>
        )}
      </div>

      <div className="mt-1 flex w-full flex-col items-center leading-none">
        <span className="max-w-[74px] truncate text-center font-headline text-kicker font-bold text-on-surface/90">
          {player.name}
        </span>
        {mode === 'rating' && <StarRow stars={stars} />}
      </div>
    </div>
  );
}
