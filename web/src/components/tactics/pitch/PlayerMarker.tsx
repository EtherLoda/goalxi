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
}

const DRAG_MIME = 'application/x-goalxi-player';

function staminaColor(stamina: number): string {
  if (stamina >= 4) return 'bg-emerald-500';
  if (stamina >= 2.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

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
 * Pitch-positioned player card. Round avatar + label below, with stamina dot.
 * The whole element is draggable (drags set the player id via custom MIME).
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
}: PlayerMarkerProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, player.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

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
      aria-label={`${player.name} (${player.position})`}
    >
      <div
        className={`relative w-12 h-12 rounded-full flex items-center justify-center font-headline font-extrabold text-[10px] uppercase cursor-grab active:cursor-grabbing ${
          isGkSlot
            ? 'bg-tertiary/20 border-2 border-tertiary text-tertiary'
            : 'bg-primary/15 border-2 border-primary text-primary'
        } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`}
      >
        {initials(player.name)}
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${staminaColor(player.stamina)} ring-2 ring-surface`}
          aria-label={`stamina ${player.stamina}`}
        />
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
      <div className="flex flex-col items-center leading-none">
        <span className="font-label text-[8px] tracking-widest uppercase text-outline">
          {positionShortLabel(slot)}
        </span>
        <span className="font-headline font-bold text-[10px] text-white truncate max-w-[64px]">
          {player.name.split(' ').pop()}
        </span>
        <span className="font-headline font-black text-[10px] text-primary">{player.overall}</span>
      </div>
    </div>
  );
}
