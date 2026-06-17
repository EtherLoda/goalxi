'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

interface SavePresetDialogProps {
  onCancel: () => void;
  onConfirm: (name: string, isDefault: boolean) => void;
}

export function SavePresetDialog({ onCancel, onConfirm }: SavePresetDialogProps) {
  const t = useTranslations('tactics.presets.dialog');
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const canConfirm = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-sm mx-4">
        <h2 className="font-headline font-bold text-lg tracking-tight text-white uppercase mb-4">
          {t('title')}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block font-label text-[10px] tracking-widest uppercase text-outline mb-1">
              {t('name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={100}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-surface-container-highest text-white border border-outline-variant/30 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="font-label text-[10px] tracking-widest uppercase text-on-surface">
              {t('setDefault')}
            </span>
          </label>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant font-label text-[10px] tracking-widest uppercase hover:text-white transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(name.trim(), isDefault)}
            disabled={!canConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-on-primary font-label text-[10px] tracking-widest uppercase hover:bg-primary-dim transition-colors disabled:opacity-50"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
