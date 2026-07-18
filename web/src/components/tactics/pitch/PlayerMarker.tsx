'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import { positionShortLabel } from '../shared/position-legend';
import type { PitchSlot } from '../types';

interface PlayerMarkerProps {
  player: Player;
  slot: PitchSlot;
  isGkSlot: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /**
   * Snapshot-driven fitness factor (cm, 0.78–1.27) and power rating
   * (sr, 0–20). The engine emits `sr` directly on the 0–20 power
   * scale (2-point ladder) — the FE just reads and displays, no
   * rescaling. Falls back to raw 0–5 stamina / form on the Player
   * object when the caller doesn't supply them (editor view,
   * pre-snapshot cases).
   */
  snapshotFitness?: number;
  snapshotStarRating?: number;
}

const DRAG_MIME = 'application/x-goalxi-player';

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Pitch-positioned player card. Round avatar + label below, with a
 * vertical form-dot strip on the left and a vertical stamina-bar strip
 * on the right. The whole element is draggable (drags set the player
 * id via custom MIME).
 */
export function PlayerMarker({
  player,
  slot,
  isGkSlot,
  isSelected = false,
  isDragging = false,
  onClick,
  onRemove,
  onDragStart,
  onDragEnd,
  snapshotFitness,
  snapshotStarRating,
}: PlayerMarkerProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, player.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

  // Left column: fitness-affected performance % (0–100). The engine's
  // `cm` is the per-snapshot contribution multiplier that already
  // folds in stamina + form + experience + ability weights
  // (1.0 = baseline; 0.78–1.27 typical range). Display as a
  // percentage capped at 100% so anything > 1.0 (experience /
  // clutch_player boosts) shows as "100%" — the reader only needs
  // to know the player is delivering full-or-better performance, not
  // the exact 127% the engine computed. Falls back to deriving a
  // proxy from raw stamina when no snapshot is supplied (editor
  // view).
  const fitnessPct =
    snapshotFitness !== undefined
      ? Math.max(0, Math.min(100, Math.round(snapshotFitness * 100)))
      : Math.max(0, Math.min(100, Math.round((player.stamina / 5) * 100)));

  // Right column: live match power rating (0–20, 2-point ladder).
  // The engine emits `sr` directly on this scale (see STAR_THRESHOLDS
  // in the simulator for the bucket table), so the FE just reads
  // and displays. Falls back to deriving a 0–20 proxy from
  // `player.overall` for the editor view.
  const powerRating =
    snapshotStarRating !== undefined
      ? Math.max(0, Math.min(20, snapshotStarRating))
      : Math.max(0, Math.min(20, player.overall / 5));

  return (
    <div
      className={`group relative flex flex-col items-center gap-1 select-none transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-90' : ''
      } ${isSelected ? 'scale-105' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={
        snapshotFitness !== undefined && snapshotStarRating !== undefined
          ? `${player.name} (${player.position}) — fitness ${Math.round(fitnessPct)}%, power ${powerRating.toFixed(0)}`
          : `${player.name} (${player.position}) — stamina ${player.stamina}, form ${player.form}`
      }
    >
      <div className="flex items-center gap-1.5">
        {/* Left: fitness (numeric) */}
        <div
          className="flex flex-col items-center justify-center min-w-7 text-[10px] font-headline font-bold text-on-surface"
          data-testid="pitch-marker-fitness"
        >
          <span className="text-outline text-[8px] uppercase tracking-widest">F</span>
          <span
            className="tabular-nums leading-none"
            title="Fitness-modulated performance % (engine cm × 100, capped at 100%)"
          >
            {Math.round(fitnessPct)}
          </span>
        </div>
        <div
          className={`relative w-12 h-12 rounded-full flex items-center justify-center font-headline font-extrabold text-[10px] uppercase cursor-grab active:cursor-grabbing ${
            isGkSlot
              ? 'bg-tertiary/20 border-2 border-tertiary text-tertiary'
              : 'bg-primary/15 border-2 border-primary text-primary'
          } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`}
        >
          {initials(player.name)}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-container-highest border border-outline-variant/40 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              aria-label="Remove player"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          )}
        </div>
        {/* Right: live power rating (0–20) */}
        <div
          className="flex flex-col items-center justify-center min-w-7 text-[10px] font-headline font-bold text-on-surface"
          data-testid="pitch-marker-power"
        >
          <span className="text-outline text-[8px] uppercase tracking-widest">P</span>
          <span
            className="tabular-nums leading-none"
            title="Live match power rating (engine sr × 4, 0–20)"
          >
            {powerRating.toFixed(0)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center leading-none">
        <span className="font-label text-[8px] tracking-widest uppercase text-outline">
          {positionShortLabel(slot)}
        </span>
        <span className="font-headline font-bold text-[10px] text-white truncate max-w-[88px]">
          {player.name}
        </span>
        <span className="font-headline font-black text-[10px] text-primary">
          {powerRating.toFixed(0)}P
        </span>
      </div>
    </div>
  );
}
