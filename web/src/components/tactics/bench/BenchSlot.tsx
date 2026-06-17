'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import type { BenchSlot, PositionKey } from '../types';
import { PlayerMarker } from '../pitch/PlayerMarker';
import { positionShortLabel } from '../shared/position-legend';

interface BenchSlotProps {
  slot: BenchSlot;
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

export function BenchSlotView({
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
}: BenchSlotProps) {
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
      className="flex flex-col items-center"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-slot={slot}
      data-testid={`slot-${slot}`}
    >
      <div
        className={`mb-1.5 px-2 py-0.5 rounded text-[9px] font-headline font-bold tracking-widest uppercase transition-all ${
          isGkSlot
            ? isDragOver
              ? 'bg-tertiary/30 text-tertiary border border-tertiary/50'
              : 'bg-tertiary/10 text-tertiary/80 border border-tertiary/30'
            : isDragOver
              ? 'bg-primary/30 text-primary border border-primary/50'
              : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/30'
        }`}
      >
        {positionShortLabel(slot)}
      </div>
      {player ? (
        <PlayerMarker
          player={player}
          slot={slot as PositionKey as never}
          isGkSlot={isGkSlot}
          onRemove={onRemove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <div
          className={`w-10 h-10 rounded-full border-2 border-dashed flex items-center justify-center transition-all ${
            isDragOver
              ? isGkSlot
                ? 'border-tertiary bg-tertiary/20 scale-110'
                : 'border-primary bg-primary/20 scale-110'
              : isGkSlot
                ? 'border-tertiary/30 bg-surface-container/60'
                : 'border-outline-variant/30 bg-surface-container/60'
          } ${isDragging ? 'cursor-pointer' : ''}`}
        >
          <span className="material-symbols-outlined text-base text-outline">person_add</span>
        </div>
      )}
    </div>
  );
}
