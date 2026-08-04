'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import { positionShortLabel } from '../tactics/shared/position-legend';
import type { PitchSlot } from '../tactics/types';

interface MatchPlayerMarkerProps {
  player: Player;
  slot: PitchSlot;
  isGkSlot: boolean;
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

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Fitness → avatar border colour
function fitnessBorderColor(fitness: number): string {
  if (fitness >= 0.9) return '#22c55e';
  if (fitness >= 0.7) return '#84cc16';
  if (fitness >= 0.5) return '#eab308';
  if (fitness >= 0.3) return '#f97316';
  return '#ef4444';
}

function fitnessBgColor(fitness: number): string {
  if (fitness >= 0.9) return 'rgba(34,197,94,0.1)';
  if (fitness >= 0.7) return 'rgba(132,204,22,0.08)';
  if (fitness >= 0.5) return 'rgba(234,179,8,0.08)';
  if (fitness >= 0.3) return 'rgba(249,115,22,0.08)';
  return 'rgba(239,68,68,0.1)';
}

function powerColor(sr: number): { bg: string; text: string } {
  if (sr >= 14) return { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' };
  if (sr >= 8)  return { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' };
  if (sr >= 4)  return { bg: 'rgba(96,165,250,0.12)', text: '#60a5fa' };
  return           { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8' };
}

const AVATAR_SIZE = 54;

export function MatchPlayerMarker({
  player,
  slot,
  isGkSlot,
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
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, String(player.id));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

  const fitness = snapshotFitness !== undefined
    ? Math.max(0, Math.min(1, snapshotFitness))
    : Math.max(0, Math.min(1, player.stamina / 5));

  const overall = (player as unknown as Record<string, unknown>).overall as number | undefined;
  const power = snapshotStarRating !== undefined
    ? Math.max(0, Math.min(20, snapshotStarRating))
    : Math.max(0, Math.min(20, (overall ?? 10) / 5));

  const fc = fitnessBorderColor(fitness);
  const fbg = fitnessBgColor(fitness);
  const pc = powerColor(power);

  // 0.5-step display for power rating
  const powerDisplay = Math.round(power * 2) / 2;

  return (
    <div
      className={`group relative flex flex-col items-center select-none transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-90' : ''
      } ${isSelected ? 'scale-110' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${player.name} — ${positionShortLabel(slot)}`}
    >
      {/* Fitness % above avatar */}
      <div
        className="font-headline font-black tabular-nums leading-none mb-1"
        style={{ color: fc, fontSize: 14, letterSpacing: '0.02em' }}
        title={`Fitness ${Math.round(fitness * 100)}%`}
      >
        {Math.round(fitness * 100)}%
      </div>

      {/* Avatar */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      >
        <div
          className={`relative rounded-full flex items-center justify-center font-headline font-extrabold text-[13px] uppercase cursor-grab active:cursor-grabbing z-10 transition-all duration-300 ${
            isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#051a14]' : ''
          } ${isSubstitute ? 'animate-pulse' : ''}`}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            background: fbg,
            border: `3px solid ${fc}`,
            color: isGkSlot ? 'rgba(168,85,247,0.9)' : 'rgba(0,228,121,0.85)',
          }}
        >
          {initials(player.name)}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#1a1a2e] border border-white/20 text-white/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              aria-label="Remove player"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Name + slot */}
      <div className="flex flex-col items-center leading-none mt-1">
        <span className="font-label text-[9px] tracking-widest uppercase text-white/40">
          {positionShortLabel(slot)}
        </span>
        <span className="font-headline font-bold text-[12px] text-white truncate max-w-[80px] text-center">
          {player.name}
        </span>
      </div>

      {/* Power rating chip */}
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mt-1"
        style={{ background: pc.bg, border: `1px solid ${pc.text}50` }}
        title={`Power rating ${powerDisplay} / 20`}
      >
        <span className="font-headline font-black tabular-nums leading-none" style={{ color: pc.text, fontSize: 14 }}>
          {powerDisplay}
        </span>
        <span style={{ color: pc.text, fontSize: 13 }}>⭐</span>
      </div>
    </div>
  );
}
