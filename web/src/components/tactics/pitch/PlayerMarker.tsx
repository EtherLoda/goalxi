'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import type { Player } from '@/lib/api';
import { positionShortLabel } from '../shared/position-legend';
import type { PitchSlot } from '../types';
import { MatchPlayerMarker } from '../../match/MatchPlayerMarker';

interface PlayerMarkerProps {
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
  /**
   * Snapshot-driven fitness factor (0–1 from ConditionSystem) and power
   * rating 0–20. When provided, the coloured ring + power badge
   * design is shown. When undefined (editor / tactics mode), the
   * original form-dot / stamina-bar layout is shown.
   */
  /**
   * True while a player is dragged over this occupied slot. The empty slots
   * already light up on drag-over; a filled slot needs the same response so
   * the player can tell a drop will SWAP rather than do nothing.
   */
  isDropTarget?: boolean;
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

function clamp01to5(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function levelClass(value: number): string {
  return value >= 4 ? 'bg-positive' : value >= 2 ? 'bg-yellow-400' : 'bg-orange-500';
}

function renderVerticalStrip(
  filled: number,
  value: number,
  rounded: 'full' | 'sm',
  label: string,
) {
  return (
    <div className="flex flex-col gap-px" aria-label={label} data-testid="pitch-marker-status">
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
}

/**
 * Pitch-positioned player card. Round avatar + label below, with a
 * vertical form-dot strip on the left and a vertical stamina-bar strip
 * on the right. The whole element is draggable (drags set the player
 * id via custom MIME).
 *
 * When `snapshotFitness` or `snapshotStarRating` is provided, delegates
 * to `MatchPlayerMarker` for the live match view.
 */
export function PlayerMarker({
  player,
  slot,
  isGkSlot,
  isSelected = false,
  isDragging = false,
  isSubstitute = false,
  isDropTarget = false,
  onClick,
  onRemove,
  onDragStart,
  onDragEnd,
  snapshotFitness,
  snapshotStarRating,
}: PlayerMarkerProps) {
  // Live match view — delegate to dedicated component
  if (snapshotFitness !== undefined || snapshotStarRating !== undefined) {
    return (
      <MatchPlayerMarker
        player={player}
        slot={slot}
        isGkSlot={isGkSlot}
        isSelected={isSelected}
        isDragging={isDragging}
        isSubstitute={isSubstitute}
        onClick={onClick}
        onRemove={onRemove}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        snapshotFitness={snapshotFitness}
        snapshotStarRating={snapshotStarRating}
      />
    );
  }

  // Editor / tactics view — original design
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, String(player.id));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

  const staminaFilled = clamp01to5(player.stamina);
  const formFilled = clamp01to5(player.form);

  // V03: the three ring colours now mean three different things. Green is the
  // primary action ("let go here and it will land"); gold is a warning (the
  // GK slot, unsaved changes); selection gets a neutral ring. Selecting a
  // player is not an action and must not borrow the action colour.
  const ringClass = isDropTarget
    ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
    : isSelected
      ? 'ring-2 ring-on-surface/60 ring-offset-2 ring-offset-surface'
      : '';

  return (
    <div
      // V01/V02: the old `transition-all` here animated layout properties too
      // (width, height, transform), which is what produced the 300ms judder
      // when the pitch re-laid out; and `scale-105` on selection moved the
      // card out of the slot it is meant to mark. Selection is the ring on
      // the avatar instead, and only paint properties transition here.
      className={`group relative flex select-none flex-col items-center gap-1 transition-[opacity,color] duration-base ${
        isDragging ? 'opacity-30' : ''
      }`}
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

        {/* Avatar */}
        <div
          className={`relative w-12 h-12 rounded-full flex items-center justify-center font-headline font-extrabold text-[10px] uppercase cursor-grab active:cursor-grabbing transition-[box-shadow] duration-base ${
            isGkSlot
              ? 'bg-tertiary/20 border-2 border-tertiary text-tertiary'
              : 'bg-primary/15 border-2 border-primary text-primary'
          } ${ringClass}`}
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
              <AppIcon name="close" className="text-[12px]" />
            </button>
          )}
        </div>

        {/* Stamina — horizontal bars stacked VERTICALLY on the RIGHT */}
        {renderVerticalStrip(staminaFilled, player.stamina, 'sm', `stamina ${player.stamina}`)}
      </div>

      {/* Bottom: slot + name + overall */}
      <div className="flex flex-col items-center leading-none">
        <span className="font-label text-[10px] tracking-widest uppercase text-outline">
          {positionShortLabel(slot)}
        </span>
        <span className="font-headline font-bold text-[10px] text-on-surface truncate max-w-[64px]">
          {player.name.split(' ').pop()}
        </span>
        <span className="font-headline font-black text-[10px] text-primary">{player.overall}</span>
      </div>
    </div>
  );
}
