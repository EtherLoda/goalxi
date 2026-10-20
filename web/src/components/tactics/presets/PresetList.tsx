'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import { useTranslations } from 'next-intl';
import type { Preset } from '@/lib/api';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { KickerLabel } from '@/components/ui/KickerLabel';
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
          <AppIcon name="bookmarks" className="text-base text-primary" />
          <KickerLabel>{t('title')}</KickerLabel>
        </div>
        <button
          type="button"
          onClick={onSaveNew}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 font-label text-kicker tracking-widest uppercase hover:bg-primary/30 transition disabled:opacity-50"
        >
          <AppIcon name="add" className="text-[12px]" />
          {t('save')}
        </button>
      </div>
      {presets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/20 px-4 py-6 text-center">
          <AppIcon name="bookmark" className="text-2xl text-outline" />
          <span className="font-label text-kicker uppercase tracking-widest text-outline">
            {t('emptyTitle')}
          </span>
          <span className="font-body text-label leading-relaxed text-on-surface-variant/75">
            {t('emptyHint')}
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
