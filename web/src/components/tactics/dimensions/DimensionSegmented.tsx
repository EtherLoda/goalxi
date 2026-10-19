'use client';

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import React from 'react';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';

export interface DimensionOption {
  value: string;
  labelKey: string;
  iconName: MaterialIconName;
}

interface DimensionSegmentedProps {
  label: string;
  iconName: MaterialIconName;
  value: string;
  options: DimensionOption[];
  onChange: (value: string) => void;
  disabled: boolean;
}

export function DimensionSegmented({ label, iconName, value, options, onChange, disabled }: DimensionSegmentedProps) {
  const t = useTranslations('tactics.dimensions');

  return (
    // Label left, control right. Stacking them made each dimension a
    // two-line block, and two of those side by side read as a form with four
    // unrelated fields; as rows they read as two switches.
    <div className="flex items-center gap-4">
      <div className="flex w-[92px] shrink-0 items-center gap-1.5">
        <AppIcon name={iconName} className="text-sm text-primary" />
        <span className="font-label text-kicker tracking-[0.18em] uppercase text-outline">{label}</span>
      </div>
      <div className="flex flex-1 gap-1 rounded-lg bg-surface-container-highest p-1">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 font-label text-label tracking-widest uppercase transition-colors duration-quick',
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              data-testid={`dimension-${opt.value}`}
            >
              <AppIcon name={opt.iconName} className="text-body" />
              {t(opt.labelKey as `pitchWidth.narrow` | `pitchWidth.balanced` | `pitchWidth.wide` | `defensiveLine.low` | `defensiveLine.mid` | `defensiveLine.high`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
