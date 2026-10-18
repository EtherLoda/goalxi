'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import type { PitchSlot } from '../types';
import { PITCH_COORDS } from './pitch-grid';
import { PlayerMarker } from './PlayerMarker';

interface PositionSlotProps {
  slot: PitchSlot;
  playerId: number | null;
  player: Player | null;
  isGkSlot: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  /**
   * Multiplier applied to the slot's children to cancel out the parent's
   * `scaleX` (driven by `pitchWidth`). Defaults to 1 — i.e. no counter-scaling —
   * so callers that don't sit inside a scaled pitch can use this component
   * unchanged.
   */
  counterScaleX?: number;
  /** True while a player is dragged over this (already filled) slot. */
  isDropTarget?: boolean;
  onDrop: (playerId: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const DRAG_MIME = 'application/x-goalxi-player';

/**
 * A single position slot on the pitch — either a player marker or an empty target.
 * Handles drop events using the custom MIME type set by the roster.
 */
export function PositionSlot({
  slot,
  playerId,
  player,
  isGkSlot,
  isDragOver,
  isDragging,
  counterScaleX = 1,
  isDropTarget = false,
  onDrop,
  onRemove,
  onDragStart,
  onDragEnd,
}: PositionSlotProps) {
  const coords = PITCH_COORDS[slot];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedId = e.dataTransfer.getData(DRAG_MIME);
    if (droppedId) onDrop(Number(droppedId));
  };

  // Only emit a transform when we actually need to counter-scale — avoids
  // creating a new compositing layer for the common balanced case.
  //
  // When it IS active the transition must match the pitch container's
  // (`transition-transform duration-slow ease-standard` in PitchField)
  // exactly. Without it the parent animates 1 -> 1.10 over 300ms while this
  // child jumps to 1/1.10 on the first frame, so every card is rendered
  // horizontally squashed for the whole transition and then snaps back.
  const innerStyle =
    counterScaleX === 1
      ? undefined
      : {
          transform: `scaleX(${counterScaleX})`,
          transformOrigin: 'center center',
        };
  const innerClassName =
    counterScaleX === 1 ? undefined : 'transition-transform duration-slow ease-standard';

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-slot={slot}
      data-testid={`slot-${slot}`}
    >
      <div className={innerClassName} style={innerStyle}>
        {player ? (
          <PlayerMarker
            player={player}
            slot={slot}
            isGkSlot={isGkSlot}
            isDropTarget={isDropTarget}
            onRemove={onRemove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ) : isDragging ? (
          // Empty slots only appear as drop targets while a drag is in
          // flight. Outside of drag mode the pitch stays clean.
          <div
            className={`w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center transition-all duration-base ${
              isDragOver
                ? isGkSlot
                  ? 'border-tertiary bg-tertiary/20 scale-110'
                  : 'border-primary bg-primary/20 scale-110'
                : isGkSlot
                  ? 'border-tertiary/30 bg-surface-container/60'
                  : 'border-outline-variant/30 bg-surface-container/60'
            } ${isDragging ? 'cursor-pointer' : ''}`}
          >
            <span className={`font-label text-[8px] tracking-widest uppercase ${isGkSlot ? 'text-tertiary/70' : 'text-outline'}`}>
              {slot}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
