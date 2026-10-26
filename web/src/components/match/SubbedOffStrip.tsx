'use client';

import React from 'react';
import { AppIcon } from '@/components/icons/AppIcon';

export interface SubbedOffPlayer {
  key: string;
  name: string;
  minute: number;
  isHome: boolean;
}

interface SubbedOffStripProps {
  players: readonly SubbedOffPlayer[];
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * The footer under the pitch: only the players who came OFF.
 *
 * Deliberately one-directional. A substitution is a swap, and printing both
 * halves doubles the strip without adding a fact — the replacement is
 * already standing on the pitch, so the only thing the reader cannot see
 * there is who left.
 */
export function SubbedOffStrip({ players }: SubbedOffStripProps) {
  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center py-1 font-label text-kicker tracking-widest text-on-surface/25 uppercase">
        —
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
      <span className="shrink-0 font-label text-kicker tracking-widest text-on-surface/30 uppercase">
        换下
      </span>
      {players.map((p) => (
        <div key={p.key} className="flex shrink-0 items-center gap-1.5">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 font-headline text-[9px] font-bold text-red-300/90">
            {initials(p.name)}
            <AppIcon
              name="swap_vert"
              className="absolute -bottom-1 -right-1 rounded-full bg-ink-750 text-[9px] text-red-400"
            />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-headline text-kicker font-semibold text-on-surface/80">
              {p.name}
            </span>
            <span className="font-label text-[9px] tabular-nums text-on-surface/35">
              {p.minute}&apos;
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
