'use client';

import React, { useState, useCallback } from 'react';
import type { Player } from '@/lib/api';
import type { DefensiveLineValue, LineupMap, PitchSlot, PitchWidthValue, PositionKey } from '../types';
import { PITCH_SLOTS } from '../types';
import { computeDimensionOffsets } from './pitch-grid';
import { PositionSlot } from './PositionSlot';

interface PitchFieldProps {
  lineup: LineupMap;
  playersById: Map<string, Player>;
  defensiveLine: DefensiveLineValue;
  pitchWidth: PitchWidthValue;
  tempo: 'slow' | 'balanced' | 'fast';
  isDragging: boolean;
  onDrop: (toSlot: PitchSlot, playerId: string, fromSlot: PositionKey | null) => void;
  onRemove: (slot: PitchSlot) => void;
  onDragStart: (slot: PitchSlot) => void;
  onDragEnd: () => void;
}

const DRAG_MIME = 'application/x-goalxi-player';

/**
 * SVG-based 2D pitch. Renders the 18 pitch slots and reacts to dimension changes
 * by translating the lines up/down (defensiveLine) and scaling X (pitchWidth).
 */
export function PitchField({
  lineup,
  playersById,
  defensiveLine,
  pitchWidth,
  tempo,
  isDragging,
  onDrop,
  onRemove,
  onDragStart,
  onDragEnd,
}: PitchFieldProps) {
  const [dragOverSlot, setDragOverSlot] = useState<PitchSlot | null>(null);
  const [draggingFromSlot, setDraggingFromSlot] = useState<PitchSlot | null>(null);

  const offsets = computeDimensionOffsets(defensiveLine, pitchWidth);
  // Slots spread apart when pitch is wide, but each card should keep a
  // fixed visual width — so children counter-scale against the parent scaleX.
  const counterScaleX = 1 / offsets.scaleX;
  const tempoGlow =
    tempo === 'fast' ? 'shadow-[0_0_60px_rgba(0,228,121,0.25)]' : tempo === 'slow' ? 'shadow-none' : 'shadow-[0_0_30px_rgba(0,228,121,0.12)]';

  const handleSlotDrop = useCallback(
    (slot: PitchSlot) => (playerId: string) => {
      const fromSlot = draggingFromSlot;
      setDragOverSlot(null);
      setDraggingFromSlot(null);
      onDrop(slot, playerId, fromSlot);
    },
    [draggingFromSlot, onDrop],
  );

  return (
    <div className={`relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/5 bg-[#051a14] transition-shadow duration-500 ${tempoGlow}`}>
      {/* Pitch surface */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/40 via-emerald-800/30 to-emerald-950/40" />
      <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,rgba(0,0,0,0.15)_40px,rgba(0,0,0,0.15)_80px)]" />

      {/* SVG pitch markings */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Outer line */}
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(0,228,121,0.18)" strokeWidth="0.4" />
        {/* Center line */}
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(0,228,121,0.18)" strokeWidth="0.4" />
        {/* Center circle */}
        <circle cx="50" cy="50" r="8" fill="none" stroke="rgba(0,228,121,0.18)" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="0.5" fill="rgba(0,228,121,0.4)" />
        {/* Penalty areas (attacking = top) */}
        <path d="M 20 2 L 20 16 L 80 16 L 80 2" fill="none" stroke="rgba(0,228,121,0.18)" strokeWidth="0.4" />
        <path d="M 20 98 L 20 84 L 80 84 L 80 98" fill="none" stroke="rgba(0,228,121,0.18)" strokeWidth="0.4" />
        {/* Goal areas */}
        <path d="M 32 2 L 32 8 L 68 8 L 68 2" fill="none" stroke="rgba(0,228,121,0.12)" strokeWidth="0.3" />
        <path d="M 32 98 L 32 92 L 68 92 L 68 98" fill="none" stroke="rgba(0,228,121,0.12)" strokeWidth="0.3" />
      </svg>

      {/* Position slots — apply defensiveLine translation & pitchWidth scaling */}
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transform: `translateY(${offsets.translateY}%) scaleX(${offsets.scaleX})`,
          transformOrigin: 'center center',
        }}
      >
        {PITCH_SLOTS.map((slot) => {
          const playerId = lineup[slot] ?? null;
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
                if (droppedId) handleSlotDrop(slot)(droppedId);
              }}
            >
              <PositionSlot
                slot={slot}
                playerId={playerId}
                player={player}
                isGkSlot={slot === 'GK'}
                isDragOver={dragOverSlot === slot}
                isDragging={isDragging}
                counterScaleX={counterScaleX}
                onDrop={handleSlotDrop(slot)}
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
