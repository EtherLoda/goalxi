"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import type { ReactNode } from "react";

/**
 * Art for each stadium level, keyed by `stadium.level`.
 *
 * EMPTY ON PURPOSE — this is the seam for the 3D stadium renders. When the
 * five images exist, drop them into `web/public/stadium/level-1.webp` …
 * `level-5.webp` and fill this map; no layout change is needed because the
 * stage already reserves the box. Until then the SVG pitch renders.
 *
 * Keep one art direction across all five (same camera angle, same key light,
 * transparent ground) — mixing styles reads as a collage, not as a stadium
 * that grew.
 */
export const STADIUM_LEVEL_ART: Readonly<Record<number, string>> = {};

interface StadiumStageProps {
  /** Level, so a future replacement can pick the matching render. */
  level: number;
  /** The fallback visual — the football-pitch diagram today. */
  children: ReactNode;
  /** Occupancy figure, e.g. `87%`. */
  occupancyText: string;
  labels: {
    level: string;
    occupancy: string;
    hint: string;
    cap: string;
    rename: string;
  };
  onRename: () => void;
}

/**
 * The visual half of the stadium header.
 *
 * Fixed aspect ratio so swapping the diagram for a render (or a render for
 * another render) cannot reflow the page — the box is booked in advance.
 */
export function StadiumStage({
  level,
  children,
  occupancyText,
  labels,
  onRename,
}: StadiumStageProps) {
  const art = STADIUM_LEVEL_ART[level];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low via-surface-container to-surface-container-low">
      <div className="relative aspect-[16/10] w-full">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-end justify-center p-2">
            {children}
          </div>
        )}

        {/* Level + rename, top edge */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-surface-container-highest/70 px-2 py-0.5 font-mono text-[10px] font-black tabular-nums text-primary backdrop-blur-sm">
            {labels.level}
          </span>
          <button
            type="button"
            onClick={onRename}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-surface-container-highest/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary backdrop-blur-sm hover:bg-primary/15 transition-colors"
            aria-label={labels.rename}
          >
            <AppIcon name="edit" className="text-[14px]" />
            {labels.rename}
          </button>
        </div>

        {/* Occupancy, bottom edge — one number, no bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-dim/85 to-transparent px-4 pb-3 pt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant">
                {labels.occupancy}
              </div>
              <div className="font-headline text-5xl font-black leading-none text-on-surface tabular-nums">
                {occupancyText}
              </div>
            </div>
            <div className="pb-1 text-right">
              <div className="text-[10px] text-on-surface-variant">
                {labels.hint}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-primary">
                {labels.cap}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
