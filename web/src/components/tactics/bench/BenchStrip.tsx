'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { BenchMap, BenchSlot, PositionKey } from '../types';
import { BENCH_SLOTS } from '../types';
import { KickerLabel } from '../shared/KickerLabel';
import { BenchSlotView } from './BenchSlot';

interface BenchStripProps {
  bench: BenchMap;
  playersById: Map<string, Player>;
  isDragging: boolean;
  onDrop: (toSlot: BenchSlot, playerId: string, fromSlot: PositionKey | null) => void;
  onRemove: (slot: BenchSlot) => void;
  onDragStart: (slot: BenchSlot) => void;
  onDragEnd: () => void;
}

const DRAG_MIME = 'application/x-goalxi-player';

/**
 * The 6 bench slots rendered as a horizontal strip below the pitch.
 */
export function BenchStrip({
  bench,
  playersById,
  isDragging,
  onDrop,
  onRemove,
  onDragStart,
  onDragEnd,
}: BenchStripProps) {
  const t = useTranslations('tactics.bench');
  const [dragOverSlot, setDragOverSlot] = useState<BenchSlot | null>(null);
  const [draggingFromSlot, setDraggingFromSlot] = useState<BenchSlot | null>(null);

  return (
    <div className="mt-3 w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <KickerLabel>{t('title')}</KickerLabel>
        <span className="font-label text-[9px] text-outline">{t('hint')}</span>
      </div>
      <div className="flex gap-2 p-3 rounded-xl bg-surface-container border border-outline-variant/30">
        {BENCH_SLOTS.map((slot) => {
          const playerId = bench[slot] ?? null;
          const player = playerId ? playersById.get(playerId) ?? null : null;
          return (
            <div
              key={slot}
              className="flex-1"
              onDragEnter={() => setDragOverSlot(slot)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverSlot(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const droppedId = e.dataTransfer.getData(DRAG_MIME);
                if (droppedId) {
                  onDrop(slot, droppedId, draggingFromSlot);
                  setDraggingFromSlot(null);
                  setDragOverSlot(null);
                }
              }}
            >
              <BenchSlotView
                slot={slot}
                playerId={playerId}
                player={player}
                isGkSlot={slot === 'BENCH_GK'}
                isDragOver={dragOverSlot === slot}
                isDragging={isDragging}
                onDrop={(playerId) => {
                  onDrop(slot, playerId, draggingFromSlot);
                  setDraggingFromSlot(null);
                  setDragOverSlot(null);
                }}
                onRemove={() => onRemove(slot)}
                onDragStart={() => {
                  setDraggingFromSlot(slot);
                  onDragStart(slot);
                }}
                onDragEnd={() => {
                  setDraggingFromSlot(null);
                  setDragOverSlot(null);
                  onDragEnd();
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
