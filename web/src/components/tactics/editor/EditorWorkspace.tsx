'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Player } from '@/lib/api';
import { PlayerRoster, type RosterDensity } from '../roster/PlayerRoster';
import { PitchField } from '../pitch/PitchField';
import { BenchStrip } from '../bench/BenchStrip';
import { DimensionsPanel } from '../dimensions/DimensionsPanel';
import { TacticalEventsPanel } from '../events/TacticalEventsPanel';
import { TeamTacticBar } from '../team-tactic/TeamTacticBar';
import { TeamTacticPicker } from '../team-tactic/TeamTacticPicker';
import { useTeamTactics } from '../team-tactic/use-team-tactics';
import { GlassPanel } from '../shared/GlassPanel';
import { KickerLabel } from '../shared/KickerLabel';
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
  onTeamTacticChange: (tactic: TeamTacticCodeValue | null) => void;
  // Events
  events: TacticalEvent[];
  starters: Player[];
  benchPlayers: Player[];
  pitchPlayers: Player[];
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
  onDragStart: (slot: PositionKey) => void;
  onDragEnd: () => void;
  onRosterDragStart: (playerId: number) => void;
}

/**
 * Renders the panel combination for the current shell position.
 *
 * Two structural rules from the design doc are enforced here, not in CSS:
 *
 *  - the 阵容 tab is exactly two columns (pitch, then a fixed 420px roster),
 *    because the roster is the thing being dragged FROM and must not move
 *    when the ball goes in;
 *  - the 战术与换人 tab has NO pitch. It carries the family tally instead,
 *    which is the only information the deployment gate actually needs, and
 *    dropping the pitch there is what removes the third scroll container.
 *
 * Presets are not rendered here at all: they live in the header drawer,
 * because applying one is a file operation rather than a tactical decision.
 */
export function EditorWorkspace(props: EditorWorkspaceProps) {
  const {
    view, tab,
    lineup, bench, playersById, players, assignedPlayerIds,
    pitchWidth, defensiveLine,
    teamTactic, onTeamTacticChange,
    events, starters, benchPlayers, pitchPlayers,
    density, onDensityChange,
    isDragging, isLocked,
    onPitchDrop, onBenchDrop, onRemovePitch, onRemoveBench,
    onDimensionChange,
    onAddSub, onAddMove, onUpdateEvent, onRemoveEvent,
    onDragStart, onDragEnd, onRosterDragStart,
  } = props;

  const t = useTranslations('tactics.teamTactic');
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
      {/* The pitch is `w-full aspect-[3/4]`. In the old three-column grid it
          was ~780px wide; as a two-column layout its column is ~1100px, which
          would make it 1460px tall. Capping the WIDTH so that width × 4/3
          fits the viewport keeps the whole shape on screen at 1080p. */}
      <div className="w-full mx-auto lg:max-w-[calc((100vh-300px)*0.75)]">
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
      </div>
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

  const tacticPanel = (
    <div className="flex flex-col gap-3">
      <DimensionsPanel
        pitchWidth={pitchWidth}
        defensiveLine={defensiveLine}
        onChange={onDimensionChange}
        disabled={isLocked}
      />
      <GlassPanel size="sm">
        <div className="flex items-center gap-1.5 mb-2.5">
          <KickerLabel>{t('title')}</KickerLabel>
        </div>
        <TeamTacticPicker
          value={teamTactic}
          lineup={lineup}
          table={teamTactics.table}
          isLoading={teamTactics.isLoading}
          error={teamTactics.error}
          disabled={isLocked}
          onChange={onTeamTacticChange}
        />
      </GlassPanel>
    </div>
  );

  const changesPanel = (collapsible: boolean, defaultCollapsed: boolean) => (
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
      collapsible={collapsible}
      defaultCollapsed={defaultCollapsed}
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
          {tacticBar}
          {pitchColumn}
          {roster}
        </div>
      );
    }
    if (tab === 'tactics') {
      return tacticPanel;
    }
    return changesPanel(false, false);
  }

  // --------------------------------------------------------------- desktop
  if (tab === 'lineup') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
        <div className="flex flex-col gap-3 min-w-0">
          {tacticBar}
          {pitchColumn}
        </div>
        {/* The roster owns the only scroll container on this tab. It needs an
            explicit height (not just max-height): `PlayerRoster` is
            `flex flex-col h-full` and its list is `flex-1 overflow-y-auto`,
            which only scrolls when the ancestor's height is definite. */}
        <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-150px)] overflow-hidden">
          {roster}
        </div>
      </div>
    );
  }

  // 战术与换人 tab: no pitch, two independent halves.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="min-w-0">{tacticPanel}</div>
      <div className="min-w-0">{changesPanel(true, true)}</div>
    </div>
  );
}
