'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type {
  DefensiveLineValue,
  PitchWidthValue,
  TempoValue,
} from '../types';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
import { DimensionSegmented, type DimensionOption } from './DimensionSegmented';

interface DimensionsPanelProps {
  tempo: TempoValue;
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  onChange: (key: 'tempo' | 'pitchWidth' | 'defensiveLine', value: string) => void;
  disabled: boolean;
}

const TEMPO_OPTIONS: DimensionOption[] = [
  { value: 'slow', labelKey: 'tempo.slow', iconName: 'turtle' },
  { value: 'balanced', labelKey: 'tempo.balanced', iconName: 'balance' },
  { value: 'fast', labelKey: 'tempo.fast', iconName: 'speed' },
];

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

export function DimensionsPanel({ tempo, pitchWidth, defensiveLine, onChange, disabled }: DimensionsPanelProps) {
  const t = useTranslations('tactics.dimensions');
  return (
    <GlassPanel size="md">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined text-base text-primary">tune</span>
        <KickerLabel>{t('title')}</KickerLabel>
      </div>
      <div className="space-y-3">
        <DimensionSegmented
          label={t('tempo.label')}
          iconName="speed"
          value={tempo}
          options={TEMPO_OPTIONS}
          onChange={(v) => onChange('tempo', v)}
          disabled={disabled}
        />
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
