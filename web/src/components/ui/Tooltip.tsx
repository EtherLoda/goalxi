'use client';

import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type Side = 'top' | 'bottom';
type Align = 'center' | 'end';

interface TooltipProps {
  /** The text bubble. Nothing renders when this is empty. */
  label: ReactNode;
  side?: Side;
  /** `end` pins the bubble's right edge, for triggers near a panel's edge. */
  align?: Align;
  /** Let long labels wrap instead of stretching the bubble off-screen. */
  wrap?: boolean;
  /** Applied to the wrapper — pass `flex-1` when the trigger must fill a row. */
  className?: string;
  /**
   * Render into `document.body` with fixed coordinates. Required when the
   * trigger sits in a scroll container: an absolutely-positioned bubble is
   * clipped by the container's box, which cut the commentary rows in half.
   */
  portal?: boolean;
  children: ReactNode;
}

const BUBBLE =
  'pointer-events-none absolute z-50 rounded-lg border border-outline-variant/50 ' +
  'bg-surface-container-highest/95 px-2 py-1 font-label text-kicker font-bold tracking-[0.04em] ' +
  'text-on-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.85)] backdrop-blur-sm ' +
  'opacity-0 transition duration-quick ease-out ' +
  'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100';

const POSITION: Record<Side, Record<Align, string>> = {
  top: {
    center: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-0.5 group-hover/tip:translate-y-0',
    end: 'bottom-full right-0 mb-1.5 translate-y-0.5 group-hover/tip:translate-y-0',
  },
  bottom: {
    center:
      'top-full left-1/2 mt-1.5 -translate-x-1/2 -translate-y-0.5 group-hover/tip:translate-y-0',
    end: 'top-full right-0 mt-1.5 -translate-y-0.5 group-hover/tip:translate-y-0',
  },
};

const FLOATING =
  'pointer-events-none fixed z-[9999] max-w-[280px] rounded-lg border border-outline-variant/50 ' +
  'bg-surface-container-highest/95 px-2 py-1 font-label text-kicker font-bold tracking-[0.04em] ' +
  'text-on-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.85)] backdrop-blur-sm ' +
  'whitespace-normal break-words text-left';

function FloatingTooltip({
  label,
  side,
  align,
  children,
}: {
  label: ReactNode;
  side: Side;
  align: Align;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = (el: HTMLElement) => setRect(el.getBoundingClientRect());

  const style: CSSProperties | undefined = rect
    ? {
        top: side === 'top' ? undefined : rect.bottom + 6,
        bottom: side === 'top' ? window.innerHeight - rect.top + 6 : undefined,
        left: align === 'end' ? undefined : rect.left,
        right: align === 'end' ? window.innerWidth - rect.right : undefined,
      }
    : undefined;

  return (
    <span
      className="inline-flex"
      onPointerEnter={(e) => show(e.currentTarget)}
      onPointerLeave={() => setRect(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setRect(null)}
    >
      {children}
      {style
        ? createPortal(
            <span role="tooltip" className={FLOATING} style={style}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * One hover label for the whole app.
 *
 * Native `title` attributes were doing this job and looked like a 1998
 * browser: they appear after a variable delay, cannot be styled, and cannot
 * be reached from the keyboard. The default is a CSS-only bubble driven by
 * `group-hover` / `group-focus-within`, so it works for pointer and keyboard
 * alike and costs no state.
 *
 * Pass `portal` when the trigger lives inside `overflow-*`.
 *
 * The trigger should carry its own accessible name (`aria-label`); the bubble
 * is `role="tooltip"` and is not a substitute for it.
 */
export function Tooltip({
  label,
  side = 'top',
  align = 'center',
  wrap = false,
  className = '',
  portal = false,
  children,
}: TooltipProps) {
  if (!label) return <>{children}</>;

  if (portal) {
    return (
      <FloatingTooltip label={label} side={side} align={align}>
        {children}
      </FloatingTooltip>
    );
  }

  const sizing = wrap ? 'w-max max-w-[220px] whitespace-normal break-all text-left' : 'whitespace-nowrap';

  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span role="tooltip" className={`${BUBBLE} ${sizing} ${POSITION[side][align]}`}>
        {label}
      </span>
    </span>
  );
}