'use client';

import React from 'react';
import type { Player, Preset } from '@/lib/api';
import { PlayerRoster, type RosterDensity } from '../roster/PlayerRoster';
import { PitchField } from '../pitch/PitchField';
import { BenchStrip } from '../bench/BenchStrip';
import { DimensionsPanel } from '../dimensions/DimensionsPanel';
import { PresetList } from '../presets/PresetList';
import { TacticalEventsPanel } from '../events/TacticalEventsPanel';
import { TeamTacticBar } from '../team-tactic/TeamTacticBar';
import { useTeamTactics } from '../team-tactic/use-team-tactics';
import type {
  BenchSlot,
  DefensiveLineValue,
  LineupMap,
  PitchSlot,
  PitchWidthValue,
  PositionKey,
  TacticalEvent,
  TeamTacticCodeValue,
} from '../types';
import type { EditorTab } from './use-url-tab';
import type { EditorViewport } from './use-editor-viewport';

interface EditorWorkspaceProps {
  view: EditorViewport;
  tab: EditorTab;
  // Pitch
  lineup: LineupMap;
  bench: Partial<Record<BenchSlot, number | null>>;
  playersById: Map<number, Player>;
  players: Player[];
  assignedPlayerIds: Set<number>;
  // Dimensions
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  // Team tactic
  teamTactic: TeamTacticCodeValue | null;
  // Events
  events: TacticalEvent[];
  starters: Player[];
  benchPlayers: Player[];
  pitchPlayers: Player[];
  // Presets
  presets: Preset[];
  activePresetId: string | null;
  // Roster density (compact | detailed)
  density: RosterDensity;
  onDensityChange: (density: RosterDensity) => void;
  // State
  isDragging: boolean;
  isLocked: boolean;
  // Handlers
  onPitchDrop: (toSlot: PitchSlot, playerId: number, fromSlot: PositionKey | null) => void;
  onBenchDrop: (toSlot: BenchSlot, playerId: number, fromSlot: PositionKey | null) => void;
  onRemovePitch: (slot: PitchSlot) => void;
  onRemoveBench: (slot: BenchSlot) => void;
  onDimensionChange: (key: 'pitchWidth' | 'defensiveLine', value: string) => void;
  onAddSub: () => void;
  onAddMove: () => void;
  onUpdateEvent: (index: number, patch: Partial<TacticalEvent>) => void;
  onRemoveEvent: (index: number) => void;
  onApplyPreset: (preset: Preset) => void;
  onDeletePreset: (preset: Preset) => void;
  onSavePreset: () => void;
  onDragStart: (slot: PositionKey) => void;
  onDragEnd: () => void;
  onRosterDragStart: (playerId: number) => void;
}

/**
 * Renders the panel combination for the current shell position.
 *
 * The panels themselves are unchanged from the previous Bento grid; what
 * changed is that they are no longer all mounted at once. Desktop folds the
 * substitution plan into the tactical tab, mobile gives it a step of its
 * own. Keeping the JSX in one place means the two shells cannot drift apart
 * as the panels evolve.
 */
export function EditorWorkspace(props: EditorWorkspaceProps) {
  const {
    view, tab,
    lineup, bench, playersById, players, assignedPlayerIds,
    pitchWidth, defensiveLine,
    teamTactic,
    events, starters, benchPlayers, pitchPlayers,
    presets, activePresetId,
    density, onDensityChange,
    isDragging, isLocked,
    onPitchDrop, onBenchDrop, onRemovePitch, onRemoveBench,
    onDimensionChange,
    onAddSub, onAddMove, onUpdateEvent, onRemoveEvent,
    onApplyPreset, onDeletePreset, onSavePreset,
    onDragStart, onDragEnd, onRosterDragStart,
  } = props;

  const teamTactics = useTeamTactics();

  const tacticBar = (
    <TeamTacticBar
      lineup={lineup}
      teamTactic={teamTactic}
      table={teamTactics.table}
      isLoading={teamTactics.isLoading}
      error={teamTactics.error}
      isLocked={isLocked}
    />
  );

  const pitchColumn = (
    <div className="flex flex-col gap-3">
      <PitchField
        lineup={lineup}
        playersById={playersById}
        defensiveLine={defensiveLine}
        pitchWidth={pitchWidth}
        isDragging={isDragging}
        onDrop={onPitchDrop}
        onRemove={onRemovePitch}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <BenchStrip
        bench={bench}
        playersById={playersById}
        isDragging={isDragging}
        onDrop={onBenchDrop}
        onRemove={onRemoveBench}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </div>
  );

  const controlsColumn = (
    <div className="flex flex-col gap-3">
      {tacticBar}
      <DimensionsPanel
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
    </div>
  );

  const changesPanel = (
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
  );

  const roster = (
    <PlayerRoster
      players={players}
      assignedPlayerIds={assignedPlayerIds}
      density={density}
      onDensityChange={onDensityChange}
      onDragStart={onRosterDragStart}
      onDragEnd={onDragEnd}
    />
  );

  // ---------------------------------------------------------------- mobile
  if (view === 'mobile') {
    if (tab === 'lineup') {
      return (
        <div className="flex flex-col gap-3">
          {pitchColumn}
          {roster}
        </div>
      );
    }
    if (tab === 'tactics') {
      return <div className="flex flex-col gap-3">{controlsColumn}</div>;
    }
    return <div className="flex flex-col gap-3">{changesPanel}</div>;
  }

  // --------------------------------------------------------------- desktop
  if (tab === 'lineup') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)_380px] gap-4">
        <div className="flex flex-col gap-3 order-2 lg:order-1 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
          {controlsColumn}
          {changesPanel}
        </div>
        <div className="flex flex-col gap-3 order-1 lg:order-2">{pitchColumn}</div>
        <div className="order-3 lg:max-h-[calc(100vh-220px)] lg:overflow-hidden">{roster}</div>
      </div>
    );
  }

  // Tactical tab: no pitch, so the controls and the substitution plan get
  // the full width and can be read side by side.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-1">{controlsColumn}</div>
      <div className="lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">{changesPanel}</div>
    </div>
  );
}
