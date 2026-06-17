'use client';

import React from 'react';
import type { Player } from '@/lib/api';
import type { Preset } from '@/lib/api';
import { PlayerRoster } from '../roster/PlayerRoster';
import { PitchField } from '../pitch/PitchField';
import { BenchStrip } from '../bench/BenchStrip';
import { DimensionsPanel } from '../dimensions/DimensionsPanel';
import { PresetList } from '../presets/PresetList';
import { TacticalEventsPanel } from '../events/TacticalEventsPanel';
import type {
  BenchSlot,
  DefensiveLineValue,
  LineupMap,
  PitchSlot,
  PitchWidthValue,
  PositionKey,
  TempoValue,
  TacticalEvent,
} from '../types';

interface EditorBentoGridProps {
  // Pitch
  lineup: LineupMap;
  bench: Partial<Record<BenchSlot, string | null>>;
  playersById: Map<string, Player>;
  players: Player[];
  assignedPlayerIds: Set<string>;
  // Dimensions
  tempo: TempoValue;
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  // Events
  events: TacticalEvent[];
  starters: Player[];
  benchPlayers: Player[];
  pitchPlayers: Player[];
  // Presets
  presets: Preset[];
  activePresetId: string | null;
  // State
  isDragging: boolean;
  isLocked: boolean;
  // Handlers
  onPitchDrop: (toSlot: PitchSlot, playerId: string, fromSlot: PositionKey | null) => void;
  onBenchDrop: (toSlot: BenchSlot, playerId: string, fromSlot: PositionKey | null) => void;
  onRemovePitch: (slot: PitchSlot) => void;
  onRemoveBench: (slot: BenchSlot) => void;
  onDimensionChange: (key: 'tempo' | 'pitchWidth' | 'defensiveLine', value: string) => void;
  onAddSub: () => void;
  onAddMove: () => void;
  onUpdateEvent: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemoveEvent: (index: number) => void;
  onApplyPreset: (preset: Preset) => void;
  onDeletePreset: (preset: Preset) => void;
  onSavePreset: () => void;
  onDragStart: (slot: PositionKey) => void;
  onDragEnd: () => void;
  onRosterDragStart: (playerId: string) => void;
}

export function EditorBentoGrid(props: EditorBentoGridProps) {
  const {
    lineup, bench, playersById, players, assignedPlayerIds,
    tempo, pitchWidth, defensiveLine,
    events, starters, benchPlayers, pitchPlayers,
    presets, activePresetId,
    isDragging, isLocked,
    onPitchDrop, onBenchDrop, onRemovePitch, onRemoveBench,
    onDimensionChange,
    onAddSub, onAddMove, onUpdateEvent, onRemoveEvent,
    onApplyPreset, onDeletePreset, onSavePreset,
    onDragStart, onDragEnd, onRosterDragStart,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="flex flex-col gap-3">
        <PitchField
          lineup={lineup}
          playersById={playersById}
          defensiveLine={defensiveLine}
          pitchWidth={pitchWidth}
          tempo={tempo}
          isDragging={isDragging}
          onDrop={onPitchDrop}
          onRemove={onRemovePitch}
          onDragStart={(slot) => onDragStart(slot)}
          onDragEnd={onDragEnd}
        />
        <BenchStrip
          bench={bench}
          playersById={playersById}
          isDragging={isDragging}
          onDrop={onBenchDrop}
          onRemove={onRemoveBench}
          onDragStart={(slot) => onDragStart(slot)}
          onDragEnd={onDragEnd}
        />
      </div>
      <div className="flex flex-col gap-3">
        <DimensionsPanel
          tempo={tempo}
          pitchWidth={pitchWidth}
          defensiveLine={defensiveLine}
          onChange={onDimensionChange}
          disabled={isLocked}
        />
        <PresetList
          presets={presets}
          activePresetId={activePresetId}
          disabled={isLocked}
          onApply={onApplyPreset}
          onDelete={onDeletePreset}
          onSaveNew={onSavePreset}
        />
        <TacticalEventsPanel
          events={events}
          starters={starters}
          benchPlayers={benchPlayers}
          pitchPlayers={pitchPlayers}
          disabled={isLocked}
          onAddSub={onAddSub}
          onAddMove={onAddMove}
          onUpdate={onUpdateEvent}
          onRemove={onRemoveEvent}
        />
      </div>
      <div className="lg:col-span-2">
        <PlayerRoster
          players={players}
          assignedPlayerIds={assignedPlayerIds}
          onDragStart={onRosterDragStart}
          onDragEnd={onDragEnd}
        />
      </div>
    </div>
  );
}
