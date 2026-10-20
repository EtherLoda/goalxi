'use client';

import React from 'react';

export type GlassPanelSize = 'sm' | 'md' | 'lg';

interface GlassPanelProps {
  children: React.ReactNode;
  size?: GlassPanelSize;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * Reusable glass-panel container with the Tactical Architect aesthetic.
 * Pairs with `border-white/5` and the `.glass-panel` global from `app/globals.css`.
 */
export function GlassPanel({ children, size = 'md', className = '', as: Tag = 'section' }: GlassPanelProps) {
  const padding = size === 'sm' ? 'p-3' : size === 'lg' ? 'p-6' : 'p-5';
  const radius = size === 'sm' ? 'rounded-xl' : 'rounded-2xl';

  const Component = Tag as React.ElementType;
  return (
    <Component className={`glass-panel ${padding} ${radius} ${className}`}>
      {children}
    </Component>
  );
}
