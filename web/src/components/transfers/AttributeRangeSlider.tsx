"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const SCALE_MAX = 20;
/** Engine attributes run 1-20; a filter of zero width is meaningless, and a
 *  band wider than five points stops being a filter at all. */
const MIN_SPAN = 1;
const MAX_SPAN = 5;

export interface AttributeRangeSliderProps {
  label: string;
  minLabel: string;
  maxLabel: string;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}

/**
 * Two-thumb range slider for one attribute.
 *
 * Replaces a pair of `div`s that only listened for `mousedown`: touch had no
 * way to move a thumb, keyboard users could not reach one, and neither thumb
 * was announced as a slider. Pointer capture plus `role="slider"` fixes all
 * three without changing how it looks.
 */
export default function AttributeRangeSlider({
  label,
  minLabel,
  maxLabel,
  min,
  max,
  onChange,
}: AttributeRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Drag listeners are attached once, at pointerdown, so they would otherwise
  // keep acting on the values captured at that moment. Sync the ref in an
  // effect rather than during render: writing a ref while rendering is banned
  // by the react-hooks rules, and effects flush before the next pointer event.
  const latest = useRef({ min, max });
  useEffect(() => {
    latest.current = { min, max };
  }, [min, max]);

  const valueAt = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return latest.current.min;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * SCALE_MAX);
  }, []);

  const commit = useCallback(
    (which: "min" | "max", rawValue: number) => {
      const { min: lo, max: hi } = latest.current;
      const value = Math.min(SCALE_MAX, Math.max(0, rawValue));
      if (which === "min") {
        const next = Math.min(value, hi - MIN_SPAN);
        if (next < 0 || hi - next > MAX_SPAN) return;
        if (next !== lo) onChange(next, hi);
        return;
      }
      const next = Math.max(value, lo + MIN_SPAN);
      if (next > SCALE_MAX || next - lo > MAX_SPAN) return;
      if (next !== hi) onChange(lo, next);
    },
    [onChange],
  );

  const startDrag = (which: "min" | "max") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const move = (ev: PointerEvent) => commit(which, valueAt(ev.clientX));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    move(event.nativeEvent as PointerEvent);
  };

  const nudge = (which: "min" | "max") => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1;
    const current = which === "min" ? latest.current.min : latest.current.max;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(which, current - step);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commit(which, current + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      commit(which, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(which, SCALE_MAX);
    }
  };

  const percent = (value: number) => `${(value / SCALE_MAX) * 100}%`;

  return (
    <div className="mb-2 flex items-center gap-tight font-label text-kicker text-on-surface-variant">
      <span className="w-4 shrink-0 text-right tabular-nums">{min}</span>
      <div ref={trackRef} className="relative h-1 flex-1 rounded-full bg-surface-container-high">
        <div
          className="absolute h-full rounded-full bg-primary/70"
          style={{ left: percent(min), width: percent(max - min) }}
        />
        {(
          [
            { which: "min" as const, value: min },
            { which: "max" as const, value: max },
          ]
        ).map(({ which, value }) => (
          <div
            key={which}
            role="slider"
            tabIndex={0}
            aria-label={`${label} · ${which === "min" ? minLabel : maxLabel}`}
            aria-valuemin={which === "min" ? 0 : min + MIN_SPAN}
            aria-valuemax={which === "min" ? max - MIN_SPAN : SCALE_MAX}
            aria-valuenow={value}
            aria-orientation="horizontal"
            onPointerDown={startDrag(which)}
            onKeyDown={nudge(which)}
            className="absolute -top-[3px] h-2.5 w-2.5 cursor-pointer rounded-full bg-primary ring-2 ring-surface-container transition-transform duration-quick hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:scale-125 touch-none"
            style={{ left: `calc(${percent(value)} - 5px)` }}
          />
        ))}
      </div>
      <span className="w-4 shrink-0 tabular-nums">{max}</span>
    </div>
  );
}
