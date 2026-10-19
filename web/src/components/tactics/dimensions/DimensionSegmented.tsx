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
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <AppIcon name={iconName} className="text-base text-primary" />
        <span className="font-label text-[10px] tracking-[0.2em] uppercase text-outline">{label}</span>
      </div>
      <div className="flex p-1 rounded-lg bg-surface-container-highest">
        {options.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-label text-[10px] tracking-widest uppercase transition',
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              data-testid={`dimension-${opt.value}`}
            >
              <AppIcon name={opt.iconName} className="text-[12px]" />
              {t(opt.labelKey as `pitchWidth.narrow` | `pitchWidth.balanced` | `pitchWidth.wide` | `defensiveLine.low` | `defensiveLine.mid` | `defensiveLine.high`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
