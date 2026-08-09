/**
 * MatchInfoPanel — venue / weather / attendance, redesigned as a row of
 * icon+label tiles. The old version was a flat 3-line text list with
 * emoji bullets that read as noise; this version uses the same icon
 * vocabulary as the rest of the match page (material-symbols-outlined)
 * with a primary-tinted square chip and a small uppercase caption,
 * so each tile is self-contained and the panel as a whole feels like
 * part of the same design system.
 */
'use client';

import React from 'react';

interface MatchInfoPanelProps {
  /** e.g. "Emirates Stadium" */
  stadium?: string;
  /** e.g. "Sunny", "Rain", "Snow" */
  weather?: string;
  /** e.g. 50000 */
  attendance?: number;
}

function weatherIconName(w: string): string {
  const key = w.toLowerCase();
  if (key.includes('rain')) return 'rainy';
  if (key.includes('cloud')) return 'cloud';
  if (key.includes('snow')) return 'ac_unit';
  if (key.includes('storm')) return 'thunderstorm';
  if (key.includes('wind')) return 'air';
  if (key.includes('fog')) return 'foggy';
  return 'wb_sunny';
}

function formatAttendance(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface TileProps {
  icon: string;
  caption: string;
  value: string;
  capitalize?: boolean;
}

function InfoTile({ icon, caption, value, capitalize }: TileProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-7 h-7 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-[15px] leading-none">
          {icon}
        </span>
      </div>
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="font-label text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/60">
          {caption}
        </span>
        <span
          className={`font-headline font-bold text-[11px] text-on-surface truncate ${
            capitalize ? 'capitalize' : ''
          }`}
          title={value}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function MatchInfoPanel({ stadium, weather, attendance }: MatchInfoPanelProps) {
  if (!stadium && !weather && attendance === undefined) return null;

  return (
    <div className="flex flex-col gap-2">
      {stadium && (
        <InfoTile icon="stadium" caption="Venue" value={stadium} />
      )}
      {weather && (
        <InfoTile
          icon={weatherIconName(weather)}
          caption="Weather"
          value={weather}
          capitalize
        />
      )}
      {attendance !== undefined && attendance !== null && (
        <InfoTile
          icon="groups"
          caption="Attendance"
          value={formatAttendance(attendance)}
        />
      )}
    </div>
  );
}
