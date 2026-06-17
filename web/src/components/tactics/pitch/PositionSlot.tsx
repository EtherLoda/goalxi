'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import type { PitchSlot } from '../types';
import { PITCH_COORDS } from './pitch-grid';
import { PlayerMarker } from './PlayerMarker';

interface PositionSlotProps {
  slot: PitchSlot;
  playerId: string | null;
  player: Player | null;
  isGkSlot: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  onDrop: (playerId: string) => void;
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
    if (droppedId) onDrop(droppedId);
  };

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-slot={slot}
      data-testid={`slot-${slot}`}
    >
      {player ? (
        <PlayerMarker
          player={player}
          slot={slot}
          isGkSlot={isGkSlot}
          onRemove={onRemove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <div
          className={`w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center transition-all duration-200 ${
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
      )}
    </div>
  );
}
