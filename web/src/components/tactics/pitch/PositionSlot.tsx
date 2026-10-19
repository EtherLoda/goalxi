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

  // Keyboard model: exactly ONE focusable element per slot. A filled slot
  // already has one — the marker is `role="button" tabIndex={0}` — so the
  // wrapper only becomes focusable when the slot is empty. Key handling for
  // both lives in PitchField (keydown bubbles up to the slot wrapper), which
  // keeps the pick-up / move / drop state in one place instead of one copy per
  // slot.
  const wrapperFocusable = player
    ? {}
    : { tabIndex: 0, role: 'button' as const, 'aria-label': slot };

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-full"
      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-slot={slot}
      data-testid={`slot-${slot}`}
      {...wrapperFocusable}
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
        ) : (
          // V08: empty slots used to appear only while a drag was in flight,
          // so the formation's structure was invisible until you started
          // dragging — the one moment you were too busy to read it. They are
          // now always drawn at 15% and only become solid under a drag.
          // V02: the drag-over state is a ring + fill, not `scale-110`; a
          // scaling circle shifts its neighbours and reads as "the slot
          // moved" rather than "this is where it will go".
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-[border-color,background-color,box-shadow] duration-base ${
              isDragOver
                ? isGkSlot
                  ? 'border-2 border-solid border-tertiary bg-tertiary/20 ring-2 ring-tertiary/30'
                  : 'border-2 border-solid border-primary bg-primary/20 ring-2 ring-primary/30'
                : isGkSlot
                  ? 'border border-dashed border-tertiary/25'
                  : 'border border-dashed border-white/15'
            } ${isDragging ? 'cursor-pointer' : ''}`}
          >
            <span
              className={`font-label text-[10px] tracking-widest uppercase ${
                isDragOver
                  ? isGkSlot
                    ? 'text-tertiary'
                    : 'text-primary'
                  : 'text-outline/50'
              }`}
            >
              {slot}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
