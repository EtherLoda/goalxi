'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import type { Player } from '@/lib/api';
import type { DefensiveLineValue, LineupMap, PitchSlot, PitchWidthValue, PositionKey } from '../types';
import { PITCH_SLOTS } from '../types';
import { computeDimensionOffsets } from './pitch-grid';
import { PositionSlot } from './PositionSlot';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Where the defensive-line band sits on the 0-100 pitch, in the same
 * orientation as the slots (attacking goal at the top, own goal at the
 * bottom). These track the translateY values in `pitch-grid.ts`: a low line
 * holds deeper, a high line pushes up.
 */
const DEFENSIVE_LINE_BAND_Y: Record<DefensiveLineValue, number> = {
  low: 62,
  mid: 50,
  high: 38,
};

interface PitchFieldProps {
  lineup: LineupMap;
  playersById: Map<number, Player>;
  defensiveLine: DefensiveLineValue;
  pitchWidth: PitchWidthValue;
  isDragging: boolean;
  onDrop: (toSlot: PitchSlot, playerId: number, fromSlot: PositionKey | null) => void;
  onRemove: (slot: PitchSlot) => void;
  onDragStart: (slot: PitchSlot) => void;
  onDragEnd: () => void;
}

const DRAG_MIME = 'application/x-goalxi-player';

/**
 * SVG-based 2D pitch. Renders the 24 pitch slots and reacts to dimension changes
 * by translating the lines up/down (defensiveLine) and scaling X (pitchWidth).
 */
export function PitchField({
  lineup,
  playersById,
  defensiveLine,
  pitchWidth,
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

  const handleSlotDrop = useCallback(
    (slot: PitchSlot) => (playerId: number) => {
      const fromSlot = draggingFromSlot;
      setDragOverSlot(null);
      setDraggingFromSlot(null);
      onDrop(slot, playerId, fromSlot);
    },
    [draggingFromSlot, onDrop],
  );

  return (
    <div className={`relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/5 bg-ink-750 transition-shadow duration-deliberate`}>
      {/* Pitch surface */}
      <div className="absolute inset-0 bg-gradient-to-b from-pitch-deep/40 via-pitch-mid/30 to-pitch-dark/40" />
      {/* V06: 0.20 of black over a dark green read as a heavy banding; 0.10
          keeps the mowing stripes visible without competing with the cards. */}
      <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,rgba(0,0,0,0.15)_40px,rgba(0,0,0,0.15)_80px)]" />

      {/* SVG pitch markings — V06: lines were 0.18 alpha, which disappeared
          behind a card at 0.9 opacity. 0.30 keeps them readable. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Outer line */}
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(0,228,121,0.3)" strokeWidth="0.4" />
        {/* Center line */}
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(0,228,121,0.3)" strokeWidth="0.4" />
        {/* Penalty areas (attacking = top) */}
        <path d="M 20 2 L 20 16 L 80 16 L 80 2" fill="none" stroke="rgba(0,228,121,0.3)" strokeWidth="0.4" />
        <path d="M 20 98 L 20 84 L 80 84 L 80 98" fill="none" stroke="rgba(0,228,121,0.3)" strokeWidth="0.4" />
        {/* Goal areas */}
        <path d="M 32 2 L 32 8 L 68 8 L 68 2" fill="none" stroke="rgba(0,228,121,0.2)" strokeWidth="0.3" />
        <path d="M 32 98 L 32 92 L 68 92 L 68 98" fill="none" stroke="rgba(0,228,121,0.2)" strokeWidth="0.3" />
      </svg>

      {/* V07: the defensive line used to be communicated only by a faint
          outer glow — invisible on a phone in daylight, and it said nothing
          about WHICH line you had chosen. The line is now drawn where it
          actually sits: a band that breathes slowly at the height the squad
          is holding, so 低/中/高 is readable at a glance and the motion
          stops entirely under `prefers-reduced-motion` (MotionProvider). */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <motion.rect
          x="14"
          width="72"
          height="5"
          rx="2.5"
          fill="rgba(0,228,121,0.12)"
          initial={false}
          animate={{ y: DEFENSIVE_LINE_BAND_Y[defensiveLine] }}
          transition={{ duration: DURATION.slow, ease: EASE.standard }}
        />
        <motion.circle
          cx="50"
          r="7"
          fill="none"
          stroke="rgba(0,228,121,0.35)"
          strokeWidth="0.4"
          initial={false}
          animate={{
            cy: DEFENSIVE_LINE_BAND_Y[defensiveLine] + 2.5,
            opacity: [0.35, 0.75, 0.35],
          }}
          transition={{
            cy: { duration: DURATION.slow, ease: EASE.standard },
            opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
        <circle cx="50" cy="50" r="0.5" fill="rgba(0,228,121,0.4)" />
      </svg>

      {/* Position slots — apply defensiveLine translation & pitchWidth scaling */}
      <div
        className="absolute inset-0 transition-transform duration-slow ease-standard"
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
                if (droppedId) handleSlotDrop(slot)(Number(droppedId));
              }}
            >
              <PositionSlot
                slot={slot}
                playerId={playerId}
                player={player}
                isGkSlot={slot === 'GK'}
                isDragOver={dragOverSlot === slot}
                isDropTarget={dragOverSlot === slot}
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
