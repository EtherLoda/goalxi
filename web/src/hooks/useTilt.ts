"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * useTilt — pointer-driven 3D tilt for a card.
 *
 * The card root is provided by the caller (we don't fabricate the ref
 * inside the hook) so React 19's ref-handling lint rules see the ref
 * being attached at the component that owns the JSX. The hook then
 * attaches a pointermove handler that composes a `transform` style
 * leaning the card toward the cursor.
 *
 * Returns:
 *   - style:    inline transform to spread onto the tilt wrapper
 *   - lift:     true while pointer is over the element (lets you add
 *               a translateY lift via a class)
 *   - handlers: onPointerEnter / onPointerMove / onPointerLeave to
 *               spread onto the element
 *
 * Reduced motion is honored — when prefers-reduced-motion is on, the
 * transform stays at identity and lift is always false.
 */
export function useTilt<T extends HTMLElement>(
  cardRef: RefObject<T | null>,
  maxDeg = 6,
) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [lift, setLift] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedRef.current = mq.matches;
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (reducedRef.current) return;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width; // 0..1
      const y = (e.clientY - rect.top) / rect.height; // 0..1
      const ry = (x - 0.5) * 2 * maxDeg;
      const rx = (0.5 - y) * 2 * maxDeg;
      setStyle({
        transform: `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`,
      });
    },
    [cardRef, maxDeg],
  );

  const onEnter = useCallback(() => {
    if (reducedRef.current) return;
    setLift(true);
  }, []);

  const onLeave = useCallback(() => {
    setStyle({ transform: "perspective(900px) rotateX(0deg) rotateY(0deg)" });
    setLift(false);
  }, []);

  return { style, lift, onMove, onEnter, onLeave };
}
