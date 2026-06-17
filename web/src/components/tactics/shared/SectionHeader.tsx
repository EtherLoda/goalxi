'use client';

import React from 'react';

interface SectionHeaderProps {
  title: string;
  iconName?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Section header: a Material Symbol + uppercase headline + optional right-side action.
 * Follows the "tactical HUD" pattern established in `TacticalMatchDetail.tsx`.
 */
export function SectionHeader({ title, iconName, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h2 className="font-headline font-bold text-xs tracking-tight text-white uppercase flex items-center gap-2">
        {iconName && <span className="material-symbols-outlined text-primary text-base">{iconName}</span>}
        {title}
      </h2>
      {action && <div>{action}</div>}
    </div>
  );
}
