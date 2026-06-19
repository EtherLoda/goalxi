'use client';

import React, { useRef } from 'react';
import type { Player } from '@/lib/api';
import { usePlayerDrag } from '../shared/usePlayerDrag';

interface RosterPlayerCardProps {
  player: Player;
  isAssigned: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function staminaBars(stamina: number): number {
  return Math.max(0, Math.min(5, Math.round(stamina)));
}

function formDots(form: number): number {
  return Math.max(0, Math.min(5, Math.round(form)));
}

export function RosterPlayerCard({ player, isAssigned, onDragStart, onDragEnd }: RosterPlayerCardProps) {
  const avatarRef = useRef<HTMLDivElement>(null);
  const drag = usePlayerDrag(player.id, {
    onStart: onDragStart,
    onEnd: onDragEnd,
    dragImageRef: avatarRef,
  });

  return (
    <div
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      className={`group relative flex items-center gap-3 p-3 rounded-xl border bg-surface-container cursor-grab active:cursor-grabbing transition-all ${
        isAssigned
          ? 'border-outline-variant/20 opacity-60 grayscale'
          : 'border-outline-variant/40 hover:border-primary/60 hover:bg-surface-container-high'
      }`}
      data-player-id={player.id}
      data-testid={`roster-player-${player.id}`}
    >
      <div
        ref={avatarRef}
        className={`w-10 h-10 rounded-full flex items-center justify-center font-headline font-extrabold text-[10px] shrink-0 ${
          player.isGoalkeeper
            ? 'bg-tertiary/15 border border-tertiary/40 text-tertiary'
            : 'bg-primary/15 border border-primary/40 text-primary'
        }`}
      >
        {player.name
          .split(' ')
          .map((s) => s[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-headline font-bold text-sm text-white truncate">{player.name}</div>
        {player.displayId && <div className="font-mono text-[9px] text-[#91b2a6]">({player.displayId})</div>}
        <div className="font-label text-[9px] tracking-widest uppercase text-outline">
          {player.position}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-headline font-black text-lg text-primary leading-none">{player.overall}</div>
        <div className="flex items-center gap-1 mt-1 justify-end">
          <span className="material-symbols-outlined text-[10px] text-outline">bolt</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`w-1 h-2 rounded-sm ${i < staminaBars(player.stamina) ? 'bg-emerald-500' : 'bg-outline-variant/30'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-0.5 justify-end">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i < formDots(player.form) ? 'bg-primary' : 'bg-outline-variant/30'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
