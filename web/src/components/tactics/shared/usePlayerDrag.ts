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
import type { RefObject, DragEvent } from 'react';

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
  playerId: string,
  options: UsePlayerDragOptions = {},
): UsePlayerDragResult {
  const { onStart, onEnd, dragImageRef, dragImageOffset } = options;
  return {
    onDragStart: (e) => {
      e.dataTransfer.setData(PLAYER_DRAG_MIME, playerId);
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
