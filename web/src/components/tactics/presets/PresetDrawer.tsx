'use client';

/**
 * PresetDrawer.tsx — presets moved out of the decision area.
 *
 * Saving and applying a preset is file I/O, not a tactical choice: it was
 * occupying roughly 60% of the old left column for something most matches
 * never touch. It now hangs off a button in the header and expands inline
 * underneath it, which keeps applying one at exactly one extra click
 * (the moment the drawer is already open it is zero) without a modal —
 * a modal would steal the lineup the player is comparing against.
 */
import { AppIcon } from "@/components/icons/AppIcon";
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Preset } from '@/lib/api';
import { PresetList } from './PresetList';

export interface PresetDrawerProps {
  presets: Preset[];
  activePresetId: string | null;
  disabled: boolean;
  onApply: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onSaveNew: () => void;
}

export function PresetDrawer({
  presets,
  activePresetId,
  disabled,
  onApply,
  onDelete,
  onSaveNew,
}: PresetDrawerProps) {
  const t = useTranslations('tactics.presets');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="preset-drawer"
        className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition-colors duration-quick hover:border-white/16 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        data-testid="preset-drawer-toggle"
      >
        <AppIcon name="bookmark" className="text-[13px]" />
        {t('title')}
        {presets.length > 0 ? (
          <span className="rounded bg-white/8 px-1 tabular-nums">{presets.length}</span>
        ) : null}
        <AppIcon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-[14px]"
        />
      </button>
      {open ? (
        <div id="preset-drawer" className="w-full">
          <PresetList
            presets={presets}
            activePresetId={activePresetId}
            disabled={disabled}
            onApply={onApply}
            onDelete={onDelete}
            onSaveNew={onSaveNew}
          />
        </div>
      ) : null}
    </div>
  );
}
