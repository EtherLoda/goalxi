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

function clamp01to5(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
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
}: PlayerMarkerProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, player.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

  const staminaFilled = clamp01to5(player.stamina);
  const formFilled = clamp01to5(player.form);

  // Resolve the active colour for a single cell based on the team's
  // stamina/form value. ≥ 4 = green (good), 2–3.99 = yellow (tired),
  // < 2 = orange-red (poor). All filled cells share the same colour.
  const levelClass = (value: number) =>
    value >= 4
      ? 'bg-emerald-500'
      : value >= 2
        ? 'bg-yellow-400'
        : 'bg-orange-500';

  // Vertical status strip on the side of the avatar.
  // Form dots: 6×6 px circles (rounded='full').
  // Stamina bars: 10×6 px slim horizontal capsules (rounded='xl'),
  // stacked vertically on the avatar's right side. Same height as
  // the form dots so the two columns line up. The active colour
  // depends on the underlying value (green/yellow/orange).
  const renderVerticalStrip = (
    filled: number,
    value: number,
    rounded: 'full' | 'sm',
    label: string,
  ) => (
    <div
      className="flex flex-col gap-px"
      aria-label={label}
      data-testid="pitch-marker-status"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`${rounded === 'full' ? 'w-1.5 h-1.5 rounded-full' : 'w-2.5 h-1.5 rounded-xl'} ${
            i < filled ? levelClass(value) : 'bg-outline-variant/30'
          }`}
        />
      ))}
    </div>
  );

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
      aria-label={`${player.name} (${player.position}) — stamina ${player.stamina}, form ${player.form}`}
    >
      <div className="flex items-center gap-1">
        {/* Form — vertical dots on the LEFT of the avatar */}
        {renderVerticalStrip(formFilled, player.form, 'full', `form ${player.form}`)}
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
        {/* Stamina — horizontal bars stacked VERTICALLY on the RIGHT of
            the avatar (each bar is a small horizontal capsule). */}
        {renderVerticalStrip(staminaFilled, player.stamina, 'sm', `stamina ${player.stamina}`)}
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
