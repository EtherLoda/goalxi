"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { bandSpan, clampValue, panBand } from "./range-slider-math";

/** Engine attributes run 1-20. */
const DEFAULT_SCALE_MIN = 0;
const DEFAULT_SCALE_MAX = 20;
/** A zero-width band is meaningless, and a wide one stops being a filter. */
const DEFAULT_MIN_SPAN = 1;
const DEFAULT_MAX_SPAN = 5;

export interface AttributeRangeSliderProps {
  label: string;
  minLabel: string;
  maxLabel: string;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  /** Lowest value on the track. Defaults to 0. */
  scaleMin?: number;
  /** Highest value on the track. Defaults to 20. */
  scaleMax?: number;
  minSpan?: number;
  maxSpan?: number;
}

/**
 * Two-thumb range slider.
 *
 * Dragging a thumb resizes the band; dragging the band itself PANS it, keeping
 * the width. Panning matters because two 10px thumbs on a 4px track are a
 * small target and the band is where the hand already is — without it, shifting
 * a 8-13 filter to 10-15 means two separate precise drags.
 *
 * Pointer capture plus `role="slider"` covers touch and keyboard; the thumbs
 * carry an invisible `before:-inset-2` hit area so the target is 26px without
 * changing what is drawn.
 */
export default function AttributeRangeSlider({
  label,
  minLabel,
  maxLabel,
  min,
  max,
  onChange,
  scaleMin = DEFAULT_SCALE_MIN,
  scaleMax = DEFAULT_SCALE_MAX,
  minSpan = DEFAULT_MIN_SPAN,
  maxSpan = DEFAULT_MAX_SPAN,
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

  const domain = Math.max(1, scaleMax - scaleMin);

  /** Fractional value under the pointer — panning needs the sub-step detail
   *  that `valueAt` rounds away, otherwise a slow drag moves in 5% jumps. */
  const rawValueAt = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return latest.current.min;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return scaleMin + ratio * domain;
    },
    [scaleMin, domain],
  );

  const valueAt = useCallback(
    (clientX: number): number => Math.round(rawValueAt(clientX)),
    [rawValueAt],
  );

  /** Attach move/up once, run `apply` for the first event immediately. */
  const track = (onMove: (event: PointerEvent) => void, first?: PointerEvent) => {
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    if (first) onMove(first);
  };

  const commit = useCallback(
    (which: "min" | "max", rawValue: number) => {
      const { min: lo, max: hi } = latest.current;
      const value = clampValue(rawValue, scaleMin, scaleMax);
      if (which === "min") {
        const next = Math.min(value, hi - minSpan);
        if (next < scaleMin || hi - next > maxSpan) return;
        if (next !== lo) onChange(next, hi);
        return;
      }
      const next = Math.max(value, lo + minSpan);
      if (next > scaleMax || next - lo > maxSpan) return;
      if (next !== hi) onChange(lo, next);
    },
    [onChange, scaleMin, scaleMax, minSpan, maxSpan],
  );

  const startDrag =
    (which: "min" | "max") => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      track(
        (ev) => commit(which, valueAt(ev.clientX)),
        event.nativeEvent as PointerEvent,
      );
    };

  /** Translate the whole band, preserving its width. */
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const anchor = rawValueAt(event.clientX);
    const startMin = latest.current.min;
    const span = bandSpan(
      latest.current.min,
      latest.current.max,
      minSpan,
      maxSpan,
    );

    track((ev) => {
      const delta = rawValueAt(ev.clientX) - anchor;
      const next = panBand(startMin, span, delta, scaleMin, scaleMax);
      if (next !== latest.current.min) onChange(next, next + span);
    });
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
      commit(which, scaleMin);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(which, scaleMax);
    }
  };

  const percent = (value: number) => `${((value - scaleMin) / domain) * 100}%`;

  return (
    <div className="mb-2 flex items-center gap-tight font-label text-kicker text-on-surface-variant">
      <span className="w-5 shrink-0 text-right tabular-nums">{min}</span>
      <div ref={trackRef} className="relative h-1 flex-1 rounded-full bg-surface-container-high">
        <div
          className="pointer-events-none absolute h-full rounded-full bg-primary/70"
          style={{ left: percent(min), width: percent(max - min) }}
        />
        {/* Pan handle: taller than the track so the band is easy to grab, and
            wide enough to grab even at the minimum span. Drawn before the
            thumbs so a thumb on top always wins the pointer. */}
        <div
          onPointerDown={startPan}
          aria-hidden="true"
          className="absolute -top-2 h-5 cursor-grab touch-none active:cursor-grabbing"
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
            aria-valuemin={which === "min" ? scaleMin : min + minSpan}
            aria-valuemax={which === "min" ? max - minSpan : scaleMax}
            aria-valuenow={value}
            aria-orientation="horizontal"
            onPointerDown={startDrag(which)}
            onKeyDown={nudge(which)}
            className="absolute -top-[3px] h-2.5 w-2.5 cursor-ew-resize rounded-full bg-primary ring-2 ring-surface-container transition-transform duration-quick before:absolute before:-inset-2 before:content-[''] hover:scale-125 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-none"
            style={{ left: `calc(${percent(value)} - 5px)` }}
          />
        ))}
      </div>
      <span className="w-5 shrink-0 tabular-nums">{max}</span>
    </div>
  );
}
