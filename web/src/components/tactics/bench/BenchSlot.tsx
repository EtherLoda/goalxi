'use client';

import { AppIcon } from '@/components/icons/AppIcon';
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

/**
 * One bench slot.
 *
 * It deliberately mirrors `PositionSlot` on the pitch: a 52px circle with the
 * slot label underneath, in the same type scale and the same colours. The
 * previous version stacked a filled chip above the circle *and* let
 * `PlayerMarker` draw its own label underneath, so a filled bench slot showed
 * its position twice while an empty one showed it once, and nothing on the
 * strip matched the pitch's sizing.
 */
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

  const label = positionShortLabel(slot);

  return (
    <div
      className={`flex flex-col items-center gap-micro rounded-xl p-tight transition-colors duration-base ${
        isDragOver ? (isGkSlot ? 'bg-tertiary/[0.07]' : 'bg-primary/[0.07]') : ''
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-slot={slot}
      data-testid={`slot-${slot}`}
    >
      {player ? (
        <PlayerMarker
          player={player}
          slot={slot as PositionKey as never}
          isGkSlot={isGkSlot}
          isDropTarget={isDragOver}
          onRemove={onRemove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <>
          <div
            className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border transition-[border-color,background-color,box-shadow] duration-base ${
              isGkSlot
                ? 'border-tertiary/25 border-dashed'
                : 'border-white/15 border-dashed'
            } ${
              isDragOver
                ? isGkSlot
                  ? 'border-2 border-solid border-tertiary bg-tertiary/20 ring-2 ring-tertiary/30'
                  : 'border-2 border-solid border-primary bg-primary/20 ring-2 ring-primary/30'
                : isDragging
                  ? isGkSlot
                    ? 'bg-tertiary/10'
                    : 'bg-primary/5'
                  : ''
            } ${isDragging ? 'cursor-pointer' : ''}`}
            data-testid={`slot-${slot}-empty`}
          >
            <AppIcon
              name="person_add"
              className={`text-base ${isGkSlot ? 'text-tertiary/85' : 'text-outline'}`}
            />
          </div>
          <span className="font-label text-kicker tracking-widest uppercase text-outline">
            {label}
          </span>
        </>
      )}
    </div>
  );
}
