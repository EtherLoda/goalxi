'use client';

import React, { useState } from 'react';
import type { PitchMarkerMode } from './MatchPlayerMarker';

interface MatchPitchStageProps {
  /** Clock shown in the header, e.g. `67'` or `FT`. */
  clock: string;
  /** Secondary clock detail, e.g. `28/28 · 91'` in a replay. */
  clockNote?: string;
  /** Which of the three reads the header is on. */
  mode: PitchMarkerMode;
  onModeChange: (mode: PitchMarkerMode) => void;
  /** The progress strip, shown in a popover that opens upwards. */
  progress?: React.ReactNode;
  /** Substitutions, shown as the strip under the pitch. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const MODES: { key: PitchMarkerMode; label: string }[] = [
  { key: 'lineup', label: '阵容' },
  { key: 'rating', label: '球员评级' },
  { key: 'grid', label: '阵容评级' },
];

/**
 * The frame around the pitch: header (clock + three-way read switch), pitch,
 * footer (substitutions).
 *
 * The progress strip opens UPWARDS from the clock icon. It is a navigational
 * aid, not the main event: parking it under a button keeps the pitch at full
 * height while leaving the strip one click away — glance, jump, close.
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
    <div className="relative rounded-2xl border border-white/5 bg-ink-750">
      <div className="relative flex items-center gap-2 border-b border-white/5 bg-surface-container-low/60 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="比赛进度"
          disabled={!progress}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-quick ${
            open
              ? 'bg-primary/15 text-primary'
              : 'text-on-surface/50 hover:bg-white/5 hover:text-on-surface/80'
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 7.5V12l3 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <span className="font-headline text-label font-black tabular-nums text-on-surface/80">
          {clock}
        </span>
        {clockNote && (
          <span className="font-label text-kicker tracking-wide text-on-surface/35">{clockNote}</span>
        )}

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

        {/* Strip popover — opens upward, anchored under the clock icon. */}
        {open && progress && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 rounded-xl border border-white/10 bg-surface-container-high/95 p-2 shadow-2xl backdrop-blur">
            {progress}
          </div>
        )}
      </div>

      <div className="overflow-hidden">{children}</div>

      {footer && (
        <div className="border-t border-white/5 bg-surface-container-low/60 px-2 py-1.5">
          {footer}
        </div>
      )}
    </div>
  );
}
