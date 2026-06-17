'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Preset } from '@/lib/api';

interface PresetCardProps {
  preset: Preset;
  disabled: boolean;
  isActive: boolean;
  onApply: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
}

export function PresetCard({ preset, disabled, isActive, onApply, onDelete }: PresetCardProps) {
  const t = useTranslations('tactics.presets');
  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isActive
          ? 'border-tertiary/50 bg-tertiary/10 shadow-[0_0_15px_rgba(233,195,73,0.15)]'
          : 'border-outline-variant/30 bg-surface-container hover:border-primary/40'
      }`}
      data-testid={`preset-${preset.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {preset.isDefault && (
            <span
              className="material-symbols-outlined text-base text-tertiary"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-label={t('isDefault')}
            >
              star
            </span>
          )}
          <span className="font-headline font-bold text-sm text-white truncate">{preset.name}</span>
        </div>
        <span className="font-headline font-black text-xs text-primary tracking-tight">
          {preset.formation}
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onApply(preset)}
          disabled={disabled}
          className="flex-1 px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 font-label text-[9px] tracking-widest uppercase hover:bg-primary/30 transition-all disabled:opacity-50"
        >
          {t('apply')}
        </button>
        <button
          type="button"
          onClick={() => onDelete(preset)}
          disabled={disabled}
          className="px-2 py-1 rounded text-outline hover:text-error transition-colors disabled:opacity-50"
          aria-label={t('delete')}
        >
          <span className="material-symbols-outlined text-base">delete</span>
        </button>
      </div>
    </div>
  );
}
