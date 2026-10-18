'use client';

/**
 * usePlayerDrag — shared drag wiring for draggable player cards in the
 * tactics editor. The pitch and bench slots read the same MIME type
 * (`application/x-goalxi-player`) to identify which player is being
 * dropped, so any card that wants to participate in drag-and-drop must
 * call this hook.
 *
 * Used by `roster/RosterPlayerCard.tsx` and the new detailed card.
 */
import { useCallback, useState } from 'react';
import type { RefObject, DragEvent } from 'react';
import type { PositionKey } from '../types';

export const PLAYER_DRAG_MIME = 'application/x-goalxi-player';

export interface UsePlayerDragOptions {
  /** Called after the drag-data has been set (parent tracks drag state). */
  onStart?: (e: DragEvent<HTMLElement>) => void;
  /** Called when the drag ends (success or cancel). */
  onEnd?: () => void;
  /**
   * Optional ref to the element to use as the native drag image. When
   * supplied, the browser shows only this element (e.g. the avatar)
   * while dragging instead of the whole card. The ref must point to an
   * element already in the DOM at drag time.
   */
  dragImageRef?: RefObject<HTMLElement | null>;
  /**
   * Optional x/y offsets for the drag image (defaults to the element's
   * center so the avatar snaps under the cursor).
   */
  dragImageOffset?: { x: number; y: number };
}

export interface UsePlayerDragResult {
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function usePlayerDrag(
  playerId: number,
  options: UsePlayerDragOptions = {},
): UsePlayerDragResult {
  const { onStart, onEnd, dragImageRef, dragImageOffset } = options;
  return {
    onDragStart: (e) => {
      e.dataTransfer.setData(PLAYER_DRAG_MIME, String(playerId));
      e.dataTransfer.effectAllowed = 'move';
      // Use the avatar (or whatever `dragImageRef` points to) as the
      // browser's native drag preview instead of the full card.
      const img = dragImageRef?.current;
      if (img) {
        const rect = img.getBoundingClientRect();
        const offsetX = dragImageOffset?.x ?? rect.width / 2;
        const offsetY = dragImageOffset?.y ?? rect.height / 2;
        try {
          e.dataTransfer.setDragImage(img, offsetX, offsetY);
        } catch {
          // Some browsers (older Safari, certain test environments) throw
          // on setDragImage. Fall back to the default preview silently.
        }
      }
      onStart?.(e);
    },
    onDragEnd: () => {
      onEnd?.();
    },
  };
}

// ============================================================================
// Editor-level drag state
// ============================================================================

export interface EditorDragState {
  /** True between dragstart and dragend, whichever card started it. */
  isDragging: boolean;
  /** Slot the drag started from, or null when it started on the roster. */
  draggingFrom: PositionKey | null;
  startFromSlot: (slot: PositionKey) => void;
  startFromRoster: (playerId: number) => void;
  end: () => void;
  /** Clear without a real dragend — see the note on `reset`. */
  reset: () => void;
}

/**
 * Holds the drag state for the whole editor.
 *
 * This deliberately lives above `PitchField` rather than inside it: the
 * pitch unmounts when the player switches tab, and a drag that is still in
 * flight at that moment would otherwise leave `isDragging` stuck true, so
 * every card on the next tab would render dimmed with no drag in progress.
 *
 * Rule for callers: **call `reset()` whenever the view changes** (tab or
 * step), before or with the navigation. `end()` is for a genuine dragend;
 * `reset()` is the belt-and-braces clear for a view change, where no
 * dragend event will ever arrive for the component that just unmounted.
 */
export function useEditorDrag(): EditorDragState {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingFrom, setDraggingFrom] = useState<PositionKey | null>(null);

  const startFromSlot = useCallback((slot: PositionKey) => {
    setIsDragging(true);
    setDraggingFrom(slot);
  }, []);

  const startFromRoster = useCallback(() => {
    setIsDragging(true);
    setDraggingFrom(null);
  }, []);

  const reset = useCallback(() => {
    setIsDragging(false);
    setDraggingFrom(null);
  }, []);

  return {
    isDragging,
    draggingFrom,
    startFromSlot,
    startFromRoster,
    end: reset,
    reset,
  };
}
