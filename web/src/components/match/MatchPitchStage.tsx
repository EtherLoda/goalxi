'use client';

import React, { useState } from 'react';
import type { PitchMarkerMode } from './MatchPlayerMarker';

interface MatchPitchStageProps {
  /** Clock shown in the header left, e.g. `67'` or `FT`. */
  clock: string;
  /** Secondary clock detail, e.g. `28/28 · 91'` in a replay. */
  clockNote?: string;
  /** The two pitch reads, toggled from the header. */
  mode: PitchMarkerMode;
  onModeChange: (mode: PitchMarkerMode) => void;
  /** The progress strip, shown in a popover anchored to the clock. */
  progress: React.ReactNode;
  /** Substitutions, shown as the strip under the pitch. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const MODES: { key: PitchMarkerMode; label: string; icon: string }[] = [
  { key: 'lineup', label: '阵容', icon: 'group' },
  { key: 'rating', label: '阵容评级', icon: 'insights' },
];

/**
 * The frame around the pitch: a header (clock + view switch), the pitch
 * itself, and a footer (substitutions).
 *
 * The progress strip lives INSIDE the clock popover rather than above the
 * pitch. It is a navigational aid, not the main event — parking it under a
 * button keeps the pitch at full height while leaving the strip one click
 * away, which is how it gets used: glance, jump, close.
 */
export function MatchPitchStage({
  clock,
  clockNote,
  mode,
  onModeChange,
  progress,
  footer,
  children,
}: MatchPitchStageProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-ink-750">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-surface-container-low/60 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="比赛进度"
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-headline text-label font-black tabular-nums transition-colors duration-quick ${
            open ? 'bg-primary/15 text-primary' : 'text-on-surface/80 hover:bg-white/5'
          }`}
        >
          <span className="text-title">{clock}</span>
          {clockNote && (
            <span className="font-label text-kicker font-normal tracking-wide text-on-surface/40">
              {clockNote}
            </span>
          )}
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="text-on-surface/40">
            <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onModeChange(m.key)}
              aria-pressed={mode === m.key}
              className={`rounded-lg px-2 py-1 font-headline text-kicker font-bold transition-colors duration-quick ${
                mode === m.key
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface/50 hover:bg-white/5 hover:text-on-surface/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clock popover — the strip, only while open. */}
      {open && (
        <div className="border-b border-white/5 bg-surface-container-low/40 px-2 py-1.5">
          {progress}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Pitch                                                             */}
      {/* ---------------------------------------------------------------- */}
      {children}

      {/* ---------------------------------------------------------------- */}
      {/* Footer — substitutions                                            */}
      {/* ---------------------------------------------------------------- */}
      {footer && (
        <div className="border-t border-white/5 bg-surface-container-low/60 px-2 py-1.5">
          {footer}
        </div>
      )}
    </div>
  );
}
