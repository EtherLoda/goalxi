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

function weatherEmoji(w: string): string {
  const key = w.toLowerCase();
  if (key.includes('rain')) return '🌧️';
  if (key.includes('cloud')) return '☁️';
  if (key.includes('snow')) return '❄️';
  if (key.includes('storm')) return '⛈️';
  if (key.includes('wind')) return '💨';
  if (key.includes('fog')) return '🌫️';
  return '☀️';
}

function formatAttendance(n?: number): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function MatchInfoPanel({ stadium, weather, attendance }: MatchInfoPanelProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {stadium && (
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-[10px]">📍</span>
          <span className="font-headline font-bold text-[10px] text-white/70 truncate max-w-[140px]">
            {stadium}
          </span>
        </div>
      )}
      {weather && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">{weatherEmoji(weather)}</span>
          <span className="font-headline font-bold text-[10px] text-white/70 capitalize">
            {weather}
          </span>
        </div>
      )}
      {attendance !== undefined && attendance !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-[10px]">👥</span>
          <span className="font-headline font-bold text-[10px] text-white/70 tabular-nums">
            {formatAttendance(attendance)}
          </span>
        </div>
      )}
    </div>
  );
}
