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
import { AnimatePresence, motion } from 'motion/react';
import type { Preset } from '@/lib/api';
import { PresetList } from './PresetList';
import { DURATION, EASE } from '@/lib/motion';

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
    // `relative` + an absolutely positioned panel: the trigger sits in the
    // header, so an inline expansion would grow the header and shove the whole
    // page down every time the drawer opens.
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="preset-drawer"
        className="flex h-11 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 font-label text-kicker font-bold uppercase tracking-widest text-on-surface-variant transition-colors duration-quick hover:border-white/20 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        data-testid="preset-drawer-toggle"
      >
        <AppIcon name="bookmark" className="text-body" />
        {t('title')}
        {presets.length > 0 ? (
          <span className="rounded bg-white/10 px-1 tabular-nums">{presets.length}</span>
        ) : null}
        <AppIcon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-[14px]"
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="preset-drawer"
            className="absolute right-0 top-full z-40 mt-2 w-[340px] rounded-xl border border-white/10 bg-surface-container p-2 shadow-floating"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance }}
          >
            <PresetList
              presets={presets}
              activePresetId={activePresetId}
              disabled={disabled}
              onApply={onApply}
              onDelete={onDelete}
              onSaveNew={onSaveNew}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
