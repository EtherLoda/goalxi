'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import type { Player } from '@/lib/api';
import type { BenchSlot, PositionKey } from '../types';
import { PlayerMarker } from '../pitch/PlayerMarker';
import { positionShortLabel } from '../shared/position-legend';

interface BenchSlotProps {
  slot: BenchSlot;
  playerId: number | null;
  player: Player | null;
  isGkSlot: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  onDrop: (playerId: number) => void;
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
    if (droppedId) onDrop(Number(droppedId));
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
        className={`mb-1.5 px-2 py-0.5 rounded text-[10px] font-headline font-bold tracking-widest uppercase transition-[background-color,color,border-color] duration-base ${
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
        // Empty-slot placeholder. Always rendered (not just during a
        // drag) so the bench strip stays a clean visual grid even when
        // no subs are queued. The placeholder tint signals whether the
        // slot can accept a drop right now (`isDragging`).
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-[border-color,background-color,box-shadow] duration-base ${
            isGkSlot
              ? isDragOver
                ? 'border-tertiary bg-tertiary/20 ring-2 ring-tertiary/30'
                : isDragging
                  ? 'border-tertiary/30 bg-tertiary/10'
                  : 'border-white/12 border-dashed bg-surface-container/40'
              : isDragOver
                ? 'border-primary bg-primary/20 ring-2 ring-primary/30'
                : isDragging
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-white/12 border-dashed bg-surface-container/40'
          } ${isDragging ? 'cursor-pointer' : ''}`}
          data-testid={`slot-${slot}-empty`}
        >
          <AppIcon name="person_add" className="text-base text-outline" />
        </div>
      )}
    </div>
  );
}
