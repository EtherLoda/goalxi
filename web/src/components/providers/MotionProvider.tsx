'use client';

import { MotionConfig } from 'motion/react';

/**
 * App-wide Motion provider.
 *
 * `globals.css` already collapses CSS animations for
 * `prefers-reduced-motion: reduce` (see the media query near the bottom),
 * but that is a CSS-only safety net: the `motion` library animates with
 * inline styles driven by requestAnimationFrame, so a CSS media query
 * cannot reach it. Without this provider, every motion-driven animation
 * would keep playing at full strength for users who asked the OS to
 * reduce motion.
 *
 * `reducedMotion="user"` makes motion follow the OS setting itself:
 * transform and opacity animations become instant, so the UI still
 * changes state — it just arrives without moving.
 *
 * Rendered as a client component inside the server-side locale layout so
 * the layout does not have to become a client component itself.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
