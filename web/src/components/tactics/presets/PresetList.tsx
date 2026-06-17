'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Preset } from '@/lib/api';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { PresetCard } from './PresetCard';

interface PresetListProps {
  presets: Preset[];
  activePresetId: string | null;
  disabled: boolean;
  onApply: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onSaveNew: () => void;
}

export function PresetList({ presets, activePresetId, disabled, onApply, onDelete, onSaveNew }: PresetListProps) {
  const t = useTranslations('tactics.presets');
  return (
    <GlassPanel size="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-primary">bookmarks</span>
          <KickerLabel>{t('title')}</KickerLabel>
        </div>
        <button
          type="button"
          onClick={onSaveNew}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 font-label text-[9px] tracking-widest uppercase hover:bg-primary/30 transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[12px]">add</span>
          {t('save')}
        </button>
      </div>
      {presets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-outline-variant/20 rounded-xl">
          <span className="material-symbols-outlined text-2xl text-outline/40 mb-1">bookmark</span>
          <span className="font-label text-[10px] tracking-widest uppercase text-outline">
            No presets yet
          </span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              disabled={disabled}
              isActive={activePresetId === p.id}
              onApply={onApply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
