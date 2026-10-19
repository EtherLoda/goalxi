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
  playersById: Map<number, Player>;
  isDragging: boolean;
  onDrop: (toSlot: BenchSlot, playerId: number, fromSlot: PositionKey | null) => void;
  onRemove: (slot: BenchSlot) => void;
  onDragStart: (slot: BenchSlot) => void;
  onDragEnd: () => void;
}

const DRAG_MIME = 'application/x-goalxi-player';

/**
 * The 6 bench slots, rendered as a panel under the pitch.
 *
 * The panel treatment (inset, corners, surface) is the same one the roster
 * and the tactical panels use, so the bench reads as one of the page's
 * blocks rather than an orphan strip. Three columns on narrow screens keep
 * the 52px circles from being squeezed; six across from `sm` up.
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
    // No outer margin: the pitch column is a `gap-gutter` flex column, so
    // `mt-*` here would double the gap between the pitch and the bench.
    <div className="w-full rounded-2xl bg-surface-container/60 border border-white/[0.06] p-panel">
      <div className="mb-tight flex items-center justify-between px-micro">
        <KickerLabel>{t('title')}</KickerLabel>
        <span className="font-label text-kicker text-on-surface-variant/75">{t('hint')}</span>
      </div>
      <div className="grid grid-cols-3 gap-tight sm:grid-cols-6">
        {BENCH_SLOTS.map((slot) => {
          const playerId = bench[slot] ?? null;
          const player = playerId ? playersById.get(playerId) ?? null : null;
          return (
            <div
              key={slot}
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
                  onDrop(slot, Number(droppedId), draggingFromSlot);
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
                onDrop={(droppedPlayerId) => {
                  onDrop(slot, droppedPlayerId, draggingFromSlot);
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
