'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
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
import { DURATION, EASE } from '@/lib/motion';

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

  // Keyboard placement needs the list of players still sitting on the bench
  // touchline — i.e. everyone not already on the pitch or the bench.
  const availablePlayers = players.filter((p) => !assignedPlayerIds.has(p.id));

  const pitchColumn = (
    <div className="flex flex-col gap-gutter">
      {/* The pitch is `w-full aspect-[3/4]`, so its height is always ×4/3 of
          its width, and the cap that keeps the whole shape on screen belongs
          on the grid TRACK, not on this wrapper. Capping the wrapper left the
          `1fr` column still claiming the full remaining width and `mx-auto`
          turned that surplus into dead space on both sides of the pitch. */}
      <div className="w-full">
        <PitchField
          lineup={lineup}
          playersById={playersById}
          availablePlayers={availablePlayers}
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
    <div className="flex flex-col gap-gutter">
      <DimensionsPanel
        pitchWidth={pitchWidth}
        defensiveLine={defensiveLine}
        onChange={onDimensionChange}
        disabled={isLocked}
      />
      <GlassPanel size="sm">
        <div className="flex items-center gap-micro mb-tight">
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

  // ------------------------------------------------------------- animation
  // Tab content fades; it does NOT slide horizontally on desktop, because the
  // panels scroll and a lateral move reads as a scroll jump. Mobile steps DO
  // slide, in the direction the user walked, because there is no shared
  // horizontal context to conflict with.
  const STEPS: EditorTab[] = ['lineup', 'tactics', 'changes'];
  const stepIndex = STEPS.indexOf(tab);
  // Direction is state, not a ref: a ref read during render is what
  // `react-hooks/refs` exists to catch, and here the value genuinely takes part
  // in the render output (the sign of the x offset).
  const [previousStep, setPreviousStep] = useState<number | null>(null);
  const direction = previousStep === null || stepIndex >= previousStep ? 1 : -1;
  useEffect(() => {
    setPreviousStep(stepIndex);
  }, [stepIndex]);

  const content = (() => {
    // ---------------------------------------------------------------- mobile
    if (view === 'mobile') {
      if (tab === 'lineup') {
        return (
          <div className="flex flex-col gap-gutter">
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
        <div
          className="grid grid-cols-1 items-start justify-center gap-section lg:grid-cols-[minmax(0,1fr)_380px]"
          // The roster gets a fixed 380px — enough for the detailed card
          // (name row + ten skill bars) without wrapping — and every remaining
          // pixel goes to the pitch. The pitch keeps its 3:4 aspect, so a wider
          // column also means a taller one: it is allowed to run past the
          // fold rather than being capped back to a postage stamp.
          data-testid="lineup-grid"
        >
          <div className="flex min-w-0 flex-col gap-gutter">
            {tacticBar}
            {pitchColumn}
          </div>
          {/* The roster owns the only scroll container on this tab. It needs an
              explicit height (not just max-height): `PlayerRoster` is
              `flex flex-col h-full` and its list is `flex-1 overflow-y-auto`,
              which only scrolls when the ancestor's height is definite. */}
          <div className="overflow-hidden lg:sticky lg:top-4 lg:h-[calc(100vh-150px)]">
            {roster}
          </div>
        </div>
      );
    }

    // 战术与换人 tab: a single centred column, not two halves. The tactics
    // panel is two rows of chips and the changes panel is a collapsed list, so
    // side-by-side halves left a screen-tall hole under the shorter one.
    // Stacked and width-capped it reads as a form, which is what it is.
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-gutter">
        {tacticPanel}
        {changesPanel(true, true)}
      </div>
    );
  })();

  // Moving focus into the new panel after a tab change is what makes the tab
  // bar usable by keyboard at all: without it, focus stays on the tab button
  // and the next Tab walks into the OTHER tab rather than the content the user
  // just opened. Skipped on first mount — stealing focus on page load would
  // scroll the page and is never what the user asked for.
  const panelRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (view !== 'desktop') return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [tab, view]);

  return (
    <motion.div
      ref={panelRef}
      key={`${view}-${tab}`}
      role={view === 'desktop' ? 'tabpanel' : undefined}
      id={view === 'desktop' ? 'editor-tabpanel' : undefined}
      aria-labelledby={
        view === 'desktop'
          ? `editor-tab-${tab === 'lineup' ? 'lineup' : 'tactics'}`
          : undefined
      }
      initial={
        view === 'mobile'
          ? { opacity: 0, x: direction * 24 }
          : { opacity: 0, y: 8 }
      }
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: view === 'mobile' ? DURATION.base : DURATION.quick,
        ease: view === 'mobile' ? EASE.entrance : EASE.standard,
      }}
    >
      {content}
    </motion.div>
  );
}
