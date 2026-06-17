'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';

export interface DimensionOption {
  value: string;
  labelKey: string;
  iconName: string;
}

interface DimensionSegmentedProps {
  label: string;
  iconName: string;
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
        <span className="material-symbols-outlined text-base text-primary">{iconName}</span>
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
                'flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md font-label text-[10px] tracking-widest uppercase transition-all',
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              data-testid={`dimension-${opt.value}`}
            >
              <span className="material-symbols-outlined text-[12px]">{opt.iconName}</span>
              {t(opt.labelKey as `tempo.slow` | `tempo.balanced` | `tempo.fast` | `pitchWidth.narrow` | `pitchWidth.balanced` | `pitchWidth.wide` | `defensiveLine.low` | `defensiveLine.mid` | `defensiveLine.high`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
