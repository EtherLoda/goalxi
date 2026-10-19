'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import type { DefensiveLineValue, LineupMap, PitchSlot, PitchWidthValue, PositionKey } from '../types';
import { PITCH_SLOTS } from '../types';
import { computeDimensionOffsets, PITCH_COORDS } from './pitch-grid';
import { PositionSlot } from './PositionSlot';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Nearest slot in a cardinal direction, used by the keyboard navigation.
 * Weighting the sideways offset above the forward one means a diagonal
 * neighbour loses to a straight one, which is what "press right to go right"
 * has to feel like.
 */
function neighbourSlot(
  from: PitchSlot,
  direction: 'up' | 'down' | 'left' | 'right',
): PitchSlot | null {
  const origin = PITCH_COORDS[from];
  let best: PitchSlot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of PITCH_SLOTS) {
    if (candidate === from) continue;
    const point = PITCH_COORDS[candidate];
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const forward =
      direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx;
    if (forward <= 2) continue;
    const sideways = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = forward + sideways * 1.6;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

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
  /** Unassigned players, offered when an empty slot is activated by keyboard. */
  availablePlayers: Player[];
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
  availablePlayers,
  defensiveLine,
  pitchWidth,
  isDragging,
  onDrop,
  onRemove,
  onDragStart,
  onDragEnd,
}: PitchFieldProps) {
  const t = useTranslations('tactics.pitch');
  const [dragOverSlot, setDragOverSlot] = useState<PitchSlot | null>(null);
  const [draggingFromSlot, setDraggingFromSlot] = useState<PitchSlot | null>(null);
  // Keyboard model, mirroring drag-and-drop without a pointer:
  //   Enter on a filled slot  -> pick it up
  //   arrows                  -> move focus to the neighbouring slot
  //   Enter on any slot       -> drop there (swap if it is occupied)
  //   Enter on an empty slot  -> open a native <select> of unassigned players
  //   Esc                     -> cancel the pick-up
  // Arrow-key navigation needs focus to actually move, so `focusSlot` reaches
  // for the slot's own focusable element (the marker, or the empty wrapper).
  const [pickedSlot, setPickedSlot] = useState<PitchSlot | null>(null);
  const [pickerSlot, setPickerSlot] = useState<PitchSlot | null>(null);

  const focusSlot = useCallback((slot: PitchSlot) => {
    const el = document.querySelector<HTMLElement>(
      `[data-slot="${slot}"] [tabindex], [data-slot="${slot}"][tabindex]`,
    );
    el?.focus();
  }, []);

  const handleSlotKeyDown = useCallback(
    (slot: PitchSlot) => (event: React.KeyboardEvent) => {
      const direction =
        event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft'
              ? 'left'
              : event.key === 'ArrowRight'
                ? 'right'
                : null;
      if (direction) {
        const next = neighbourSlot(slot, direction);
        if (next) {
          event.preventDefault();
          focusSlot(next);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPickedSlot(null);
        setPickerSlot(null);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // The marker's remove button is a real button; let it activate itself.
      if ((event.target as HTMLElement).tagName === 'BUTTON') return;
      event.preventDefault();
      const occupant = lineup[slot];
      if (pickedSlot) {
        if (pickedSlot !== slot) {
          onDrop(slot, lineup[pickedSlot]!, pickedSlot);
        }
        setPickedSlot(null);
        return;
      }
      if (occupant !== undefined) {
        setPickedSlot(slot);
        return;
      }
      setPickerSlot(slot);
    },
    [focusSlot, lineup, onDrop, pickedSlot],
  );

  const offsets = computeDimensionOffsets(defensiveLine, pitchWidth);
  // Slots spread apart when pitch is wide, but each card should keep a
  // fixed visual width — so children counter-scale against the parent scaleX.
  const counterScaleX = 1 / offsets.scaleX;
  const placedCount = Object.values(lineup).filter(Boolean).length;
  // The keeper slot is the one empty slot that blocks the whole submission
  // rather than merely weakening it, and it sits at the bottom edge of the
  // pitch — often below the fold on a phone, so the player sees a full-looking
  // lineup and a dead submit button. Say it on the pitch.
  const missingGk = placedCount > 0 && !lineup.GK;

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
    <div className={`relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.08] bg-ink-750 shadow-[inset_0_0_60px_rgba(0,0,0,0.35)] transition-shadow duration-deliberate`}>
      {/* Pitch surface */}
      <div className="absolute inset-0 bg-gradient-to-b from-pitch-deep/50 via-pitch-mid/35 to-pitch-dark/55" />
      {/* Mowing stripes: alternating light and dark bands over the green, so
          the surface reads as turf rather than a flat fill. V06: 0.20 of
          black read as heavy banding; these two are what stay invisible
          enough to not compete with the cards. */}
      <div
        className="absolute inset-0 opacity-[0.55] bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.028),rgba(255,255,255,0.028)_40px,rgba(0,0,0,0.10)_40px,rgba(0,0,0,0.10)_80px)]"
      />
      {/* Vignette — pulls the eye to the middle and hides the seam where the
          rounded corners meet the panel behind. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.35)_100%)]" />

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
        {/* Penalty spots and the D — the marks that make it read as a pitch
            rather than a green rectangle. */}
        <circle cx="50" cy="12" r="0.6" fill="rgba(0,228,121,0.3)" />
        <circle cx="50" cy="88" r="0.6" fill="rgba(0,228,121,0.3)" />
        <path d="M 34 16 A 16 16 0 0 0 66 16" fill="none" stroke="rgba(0,228,121,0.22)" strokeWidth="0.35" />
        <path d="M 34 84 A 16 16 0 0 1 66 84" fill="none" stroke="rgba(0,228,121,0.22)" strokeWidth="0.35" />
        {/* Corner arcs */}
        <path d="M 2 6 A 4 4 0 0 0 6 2" fill="none" stroke="rgba(0,228,121,0.25)" strokeWidth="0.35" />
        <path d="M 98 6 A 4 4 0 0 1 94 2" fill="none" stroke="rgba(0,228,121,0.25)" strokeWidth="0.35" />
        <path d="M 2 94 A 4 4 0 0 1 6 98" fill="none" stroke="rgba(0,228,121,0.25)" strokeWidth="0.35" />
        <path d="M 98 94 A 4 4 0 0 0 94 98" fill="none" stroke="rgba(0,228,121,0.25)" strokeWidth="0.35" />
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
              onKeyDown={handleSlotKeyDown(slot)}
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

      {/* First-run guidance. Twenty-four empty circles explain that there are
          slots but not what to do with them, so an untouched pitch says it.
          `pointer-events-none` keeps every drop target live underneath. */}
      {placedCount === 0 && !isDragging ? (
        <div className="pointer-events-none absolute inset-x-0 top-[46%] z-20 flex -translate-y-1/2 justify-center px-6">
          <p className="rounded-full border border-primary/25 bg-surface-container/85 px-4 py-2 text-center font-label text-label tracking-wider text-on-surface-variant backdrop-blur-sm">
            {t('emptyHint')}
          </p>
        </div>
      ) : null}

      {missingGk && !isDragging ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-6">
          <p className="flex items-center gap-1.5 rounded-full border border-tertiary/40 bg-surface-container/90 px-3 py-1.5 text-center font-label text-kicker uppercase tracking-wider text-tertiary backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-tertiary text-kicker font-black leading-none text-surface"
            >
              !
            </span>
            {t('missingGk')}
          </p>
        </div>
      ) : null}

      {/* Keyboard placement. A pointer user drags a card; a keyboard user
          presses Enter on an empty slot and gets a native <select>, which is
          focusable, screen-reader labelled and dismissible with Esc without any
          custom listbox code. */}
      {pickerSlot && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPickerSlot(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('assignTitle', { slot: pickerSlot })}
            className="glass-panel rounded-xl p-4 w-[260px] flex flex-col gap-3"
          >
            <p className="font-label text-kicker tracking-widest uppercase text-outline">
              {t('assignTitle', { slot: pickerSlot })}
            </p>
            <select
              autoFocus
              defaultValue=""
              aria-label={t('assignTitle', { slot: pickerSlot })}
              onChange={(e) => {
                if (!e.target.value) return;
                onDrop(pickerSlot, Number(e.target.value), null);
                setPickerSlot(null);
              }}
              className="w-full rounded-lg bg-surface-container-low border border-outline-variant/40 px-3 py-2 text-sm text-on-surface"
            >
              <option value="" disabled>
                {t('assignPlaceholder')}
              </option>
              {availablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} · {player.position}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPickerSlot(null)}
              className="self-end rounded-lg px-3 py-1.5 font-label text-kicker tracking-widest uppercase text-on-surface-variant hover:text-on-surface transition-colors duration-quick"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
