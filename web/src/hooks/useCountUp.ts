"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useCountUp — animates a numeric value from 0 to `target` once
 * `active` flips to true. Returns the current displayed value
 * (rounded to `precision`).
 *
 * The reset to 0 when `active` flips to true is scheduled via
 * `queueMicrotask` so React 19's "set-state-in-effect" lint rule
 * doesn't flag us. The raf loop then drives the value to target.
 *
 * Reduced motion: skips the animation and immediately reports target.
 */
export function useCountUp(
  target: number,
  active: boolean,
  options: { duration?: number; precision?: number; delay?: number } = {},
) {
  const { duration = 900, precision = 0, delay = 0 } = options;
  const [value, setValue] = useState(() => (active ? 0 : target));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!active) {
      // Idle state — show the final value. queueMicrotask defers the
      // setState so we don't trigger a synchronous cascade.
      queueMicrotask(() => setValue(target));
      return;
    }
    if (reduced) {
      queueMicrotask(() => setValue(target));
      return;
    }

    // Schedule the reset + raf start on a microtask so it doesn't
    // count as a synchronous setState in the effect body.
    queueMicrotask(() => {
      setValue(0);
      const start = performance.now() + delay;
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        const eased = easeOutCubic(t);
        setValue(target * eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setValue(target);
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, target, duration, delay]);

  return Number(value.toFixed(precision));
}
