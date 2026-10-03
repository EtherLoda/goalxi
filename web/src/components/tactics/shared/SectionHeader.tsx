'use client';

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import React from 'react';

interface SectionHeaderProps {
  title: string;
  iconName?: MaterialIconName;
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
      <h2 className="font-headline font-bold text-xs tracking-tight text-on-surface uppercase flex items-center gap-2">
        {iconName && <AppIcon name={iconName} className="text-primary text-base" />}
        {title}
      </h2>
      {action && <div>{action}</div>}
    </div>
  );
}
