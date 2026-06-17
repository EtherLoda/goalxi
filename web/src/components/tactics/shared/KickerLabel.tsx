'use client';

import React from 'react';

interface KickerLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Small uppercase tracking label used as a section "kicker".
 * The Tactical Architect signature: 10px, tracking-widest, outline text.
 */
export function KickerLabel({ children, className = '' }: KickerLabelProps) {
  return (
    <span className={`font-label text-[10px] tracking-[0.2em] uppercase text-outline ${className}`}>
      {children}
    </span>
  );
}
