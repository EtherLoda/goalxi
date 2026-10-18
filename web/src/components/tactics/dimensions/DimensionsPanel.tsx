'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import { useTranslations } from 'next-intl';
import type {
  DefensiveLineValue,
  PitchWidthValue,
} from '../types';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { DimensionSegmented, type DimensionOption } from './DimensionSegmented';

interface DimensionsPanelProps {
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  onChange: (key: 'pitchWidth' | 'defensiveLine', value: string) => void;
  disabled: boolean;
}

// Tempo（比赛节奏）2026-10-18 整体删除，见 `../types.ts`。这里只剩宽度和
// 防线两个维度；球队战术另有独立的 UI。
const WIDTH_OPTIONS: DimensionOption[] = [
  { value: 'narrow', labelKey: 'pitchWidth.narrow', iconName: 'compress' },
  { value: 'balanced', labelKey: 'pitchWidth.balanced', iconName: 'open_in_full' },
  { value: 'wide', labelKey: 'pitchWidth.wide', iconName: 'expand' },
];

const LINE_OPTIONS: DimensionOption[] = [
  { value: 'low', labelKey: 'defensiveLine.low', iconName: 'south' },
  { value: 'mid', labelKey: 'defensiveLine.mid', iconName: 'horizontal_rule' },
  { value: 'high', labelKey: 'defensiveLine.high', iconName: 'north' },
];

export function DimensionsPanel({ pitchWidth, defensiveLine, onChange, disabled }: DimensionsPanelProps) {
  const t = useTranslations('tactics.dimensions');
  return (
    <GlassPanel size="md">
      <div className="flex items-center gap-1.5 mb-3">
        <AppIcon name="tune" className="text-base text-primary" />
        <KickerLabel>{t('title')}</KickerLabel>
      </div>
      <div className="space-y-3">
        <DimensionSegmented
          label={t('pitchWidth.label')}
          iconName="open_in_full"
          value={pitchWidth}
          options={WIDTH_OPTIONS}
          onChange={(v) => onChange('pitchWidth', v)}
          disabled={disabled}
        />
        <DimensionSegmented
          label={t('defensiveLine.label')}
          iconName="shield"
          value={defensiveLine}
          options={LINE_OPTIONS}
          onChange={(v) => onChange('defensiveLine', v)}
          disabled={disabled}
        />
      </div>
    </GlassPanel>
  );
}
