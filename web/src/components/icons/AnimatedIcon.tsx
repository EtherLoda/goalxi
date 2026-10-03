"use client";

import { MorphIcon, type IconNode } from "morphicons/react";
import { Eye, EyeOff } from "lucide";

/**
 * AnimatedIcon — the only sanctioned way to animate an icon.
 *
 * morphicons can morph any stroke icon into any other, which is
 * exactly why it needs a leash: unconstrained use turns a UI into a
 * toy. So animation is opt-in per *slot*, and a slot has to be
 * declared here before any component can animate anything. `slot` is
 * typed as the keys of this map, so reaching for a morph outside the
 * whitelist is a compile error rather than a review comment.
 *
 * Add a slot only when all three hold:
 *   1. One control, two states (a toggle), not a value that ranges.
 *   2. The two states are the same idea drawn differently, so the
 *      in-between frames read as "changing", not as "glitching".
 *   3. The animation carries meaning the static swap would lose — it
 *      draws the eye to the thing that just changed.
 *
 * Everything else stays a static <AppIcon>. Loading spinners are not
 * morph candidates either; they want `animate-spin`, which is CSS.
 *
 * Icons come from `lucide` (data), not `lucide-react` (components) —
 * MorphIcon interpolates path data and cannot consume components.
 */
const MORPH_SLOTS = {
  /** Login password field: eye ⇄ eye-off. */
  "password-visibility": { off: Eye, on: EyeOff },
} as const satisfies Record<string, { off: IconNode; on: IconNode }>;

export type MorphSlot = keyof typeof MORPH_SLOTS;

export interface AnimatedIconProps {
  /** A whitelisted slot. Anything else fails to typecheck. */
  slot: MorphSlot;
  /** false renders the slot's `off` icon, true the `on` icon. */
  active: boolean;
  /** Matches AppIcon: inherits the call site's font-size by default. */
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  /** Supply only when the icon is a control's sole content. */
  label?: string;
}

export function AnimatedIcon({
  slot,
  active,
  size = "1em",
  strokeWidth = 2,
  className,
  label,
}: AnimatedIconProps) {
  const { off, on } = MORPH_SLOTS[slot];
  return (
    <MorphIcon
      icon={active ? on : off}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      label={label}
      reducedMotion="user"
    />
  );
}