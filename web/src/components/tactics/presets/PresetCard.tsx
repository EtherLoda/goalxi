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
      <div className="flex items-center justify-between">
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
      <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-outline-variant/15">
        <button
          type="button"
          onClick={() => onDelete(preset)}
          disabled={disabled}
          className="p-1 rounded text-outline hover:text-error transition-colors disabled:opacity-50"
          aria-label={t('delete')}
        >
          <span className="material-symbols-outlined text-base">delete</span>
        </button>
        <button
          type="button"
          onClick={() => onApply(preset)}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 font-label text-[9px] font-bold tracking-widest uppercase hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[10px]">play_arrow</span>
          {t('apply')}
        </button>
      </div>
    </div>
  );
}
