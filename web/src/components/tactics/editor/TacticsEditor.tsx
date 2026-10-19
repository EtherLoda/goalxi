'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api, type Match, type Player, type Preset } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  computeLockState,
  reducer,
  selectFormation,
  selectUnassignedPlayerIds,
  useTacticsState,
  type Action,
} from '../use-tactics-state';
import { hydratePreset, hydrateTactics } from '../api-helpers';
import {
  type ValidationContext,
  type ValidatorPlayer,
  validateLineup,
} from '../lineup-validator';
import {
  MAX_VOLUNTARY_SUBSTITUTIONS,
  type BenchMap,
  type BenchSlot,
  type EditorState,
  type LockState,
  type MatchStatus,
  type PitchSlot,
  type PositionKey,
  type TacticsDraft,
  type TeamTacticCodeValue,
  createEmptyDraft,
} from '../types';
import { EditorWorkspace } from './EditorWorkspace';
import { EditorHeader } from './EditorHeader';
import { EditorTabs } from './EditorTabs';
import { EditorStepper } from './EditorStepper';
import { PresetDrawer } from '../presets/PresetDrawer';
import { useEditorViewport } from './use-editor-viewport';
import { useUrlTab } from './use-url-tab';
import { useEditorDrag } from '../shared/usePlayerDrag';
import { useTeamTactics } from '../team-tactic/use-team-tactics';
import { checkTactic } from '../team-tactic/requirement';
import type { RosterDensity } from '../roster/PlayerRoster';

interface TacticsEditorProps {
  matchId: string;
  match: Match;
}

/**
 * Container component for the tactics editor. Wires up:
 *  - State (useReducer) with hydration, validation, countdown
 *  - API calls (submit, preset CRUD)
 *  - Drag-and-drop glue (pitch + bench slot drops)
 *  - The Bento grid of sections
 */
export function TacticsEditor({ matchId, match }: TacticsEditorProps) {
  const t = useTranslations('tactics');
  const { team } = useAuth();
  const teamId = team?.id ?? '';

  // ---------------------------------------------------------------------
  // Server data
  // ---------------------------------------------------------------------
  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [dataReady, setDataReady] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  // Roster density — personal view preference, not persisted (per project pattern).
  const [density, setDensity] = React.useState<RosterDensity>('detailed');

  // Initial lock state from match
  const matchStatus: MatchStatus = (match.status as MatchStatus) ?? 'scheduled';
  const initialLock: LockState = useMemo(
    () => computeLockState(matchStatus, match.scheduledAt, Date.now()),
    [matchStatus, match.scheduledAt],
  );

  // ---------------------------------------------------------------------
  // Reducer
  // ---------------------------------------------------------------------
  const { state, dispatch, formation, isGkPlaced } = useTacticsState({ initialLock });
  const stateRef = useRef<EditorState>(state);
  stateRef.current = state;

  // ---------------------------------------------------------------------
  // Fetch initial data
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const [tacticsRes, presetList, playerList] = await Promise.all([
          api.matches.getTactics(matchId),
          api.presets.list(teamId),
          api.players.getByTeam(teamId, true),
        ]);
        if (cancelled) return;
        setPresets(presetList);
        setPlayers(playerList.items);
        const myTactics = tacticsRes.homeTactics?.teamId === teamId
          ? tacticsRes.homeTactics
          : tacticsRes.awayTactics?.teamId === teamId
            ? tacticsRes.awayTactics
            : null;
        dispatch({ type: 'HYDRATE', payload: hydrateTactics(myTactics) });
        setDataReady(true);
      } catch (err) {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : 'Failed to load');
        setDataReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, teamId, dispatch]);

  // ---------------------------------------------------------------------
  // Lock countdown
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (state.lock.isLocked) return;
    const tick = () => {
      dispatch({ type: 'TICK_LOCK', now: Date.now(), scheduledAt: match.scheduledAt });
    };
    tick();
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(tick, 1000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [state.lock.isLocked, match.scheduledAt, dispatch]);

  // ---------------------------------------------------------------------
  // PlayersById + validation context
  // ---------------------------------------------------------------------
  const playersById = useMemo(() => {
    const m = new Map<number, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const validatorPlayersById = useMemo(() => {
    const m = new Map<number, ValidatorPlayer>();
    for (const p of players) m.set(p.id, { id: p.id, isGoalkeeper: p.isGoalkeeper, name: p.name });
    return m;
  }, [players]);

  const teamPlayerIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);

  // The gate needs the requirement table, which is fetched async and cached
  // at module scope — calling the hook here as well as inside the workspace
  // resolves from that cache rather than issuing a second request.
  const teamTactics = useTeamTactics();
  const tacticGate = useMemo(() => {
    if (!state.draft.teamTactic) return null;
    if (!teamTactics.table) return null; // cannot check yet; do not invent a failure
    return checkTactic(state.draft.lineup, state.draft.teamTactic, teamTactics.table);
  }, [state.draft.teamTactic, state.draft.lineup, teamTactics.table]);

  useEffect(() => {
    const ctx: ValidationContext = {
      draft: state.draft,
      teamPlayerIds,
      playersById: validatorPlayersById,
      tacticGate,
    };
    dispatch({ type: 'REVALIDATE', ctx });
  }, [state.draft, teamPlayerIds, validatorPlayersById, tacticGate, dispatch]);

  // ---------------------------------------------------------------------
  // Validation → toast. The inline error banner above the pitch was
  // a debug-style block; the proper UX is to surface issues as a
  // toast. We only fire a toast for an error key we haven't
  // already announced in this session, so the user doesn't get
  // re-blasted on every re-render of the same bad lineup.
  // ---------------------------------------------------------------------
  const seenErrorKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentKeys = new Set(state.validation.errors.map((e) => e.key));
    const newKeys = [...currentKeys].filter((k) => !seenErrorKeysRef.current.has(k));
    for (const key of newKeys.slice(0, 3)) {
      const err = state.validation.errors.find((e) => e.key === key);
      if (err) {
        showToast(
          'warning',
          t(`validation.${err.key}` as never, err.params as never),
          '',
        );
      }
    }
    seenErrorKeysRef.current = currentKeys;
  }, [state.validation.errors, t]);

  // ---------------------------------------------------------------------
  // Shell position (desktop tabs / mobile steps) and drag state
  // ---------------------------------------------------------------------
  const viewport = useEditorViewport();
  const [tab, setTab] = useUrlTab();
  const drag = useEditorDrag();
  const resetDrag = drag.reset;

  /**
   * Switching view must clear the drag state first: the pitch (which owns
   * `dragOverSlot`) unmounts on the way out, so no dragend will ever arrive
   * and `isDragging` would stay true, dimming every card on the new tab.
   */
  const handleTabChange = useCallback(
    (next: Parameters<typeof setTab>[0]) => {
      resetDrag();
      setTab(next);
    },
    [resetDrag, setTab],
  );

  // ---------------------------------------------------------------------
  // Drop handlers
  // ---------------------------------------------------------------------
  const handlePitchDrop = useCallback(
    (toSlot: PitchSlot, playerId: number, fromSlot: PositionKey | null) => {
      if (state.lock.isLocked) return;
      const player = playersById.get(playerId);
      if (!player) return;
      if (toSlot === 'GK' && !player.isGoalkeeper) {
        showToast('error', t('validation.gkOnlyInGk'), '');
        return;
      }
      if (toSlot !== 'GK' && player.isGoalkeeper) {
        showToast('error', t('validation.outfieldersNotInGk'), '');
        return;
      }
      dispatch({ type: 'ASSIGN_PITCH', from: fromSlot, to: toSlot, playerId });
    },
    [state.lock.isLocked, playersById, dispatch, t],
  );

  const handleBenchDrop = useCallback(
    (toSlot: BenchSlot, playerId: number, fromSlot: PositionKey | null) => {
      if (state.lock.isLocked) return;
      const player = playersById.get(playerId);
      if (!player) return;
      if (toSlot === 'BENCH_GK' && !player.isGoalkeeper) {
        showToast('error', t('validation.benchGkOnly'), '');
        return;
      }
      if (toSlot !== 'BENCH_GK' && player.isGoalkeeper) {
        showToast('error', t('validation.benchGkOnly'), '');
        return;
      }
      dispatch({ type: 'ASSIGN_BENCH', from: fromSlot, to: toSlot, playerId });
    },
    [state.lock.isLocked, playersById, dispatch, t],
  );

  // ---------------------------------------------------------------------
  // Dimension change
  // ---------------------------------------------------------------------
  const handleDimensionChange = useCallback(
    (key: 'pitchWidth' | 'defensiveLine', value: string) => {
      if (state.lock.isLocked) return;
      dispatch({ type: 'SET_DIMENSION', key, value: value as never });
    },
    [state.lock.isLocked, dispatch],
  );

  const handleTeamTacticChange = useCallback(
    (tactic: TeamTacticCodeValue | null) => {
      if (state.lock.isLocked) return;
      dispatch({ type: 'SET_TEAM_TACTIC', tactic });
    },
    [state.lock.isLocked, dispatch],
  );

  // ---------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------
  const handleAddSub = useCallback(() => {
    if (state.lock.isLocked) return;
    // Refuse to add a 4th voluntary sub. Blocking here (instead of letting the
    // validator catch it) keeps the draft clean: a rejected row would show as
    // a warning toast but still occupy the panel, and the submit path would
    // then refuse the whole form for a row the player never wanted.
    const subCount = state.draft.events.filter((e) => e.kind === 'sub').length;
    if (subCount >= MAX_VOLUNTARY_SUBSTITUTIONS) {
      showToast(
        'error',
        t('validation.tooManySubs' as never, { max: MAX_VOLUNTARY_SUBSTITUTIONS } as never),
        '',
      );
      return;
    }
    dispatch({ type: 'ADD_EVENT', event: { kind: 'sub', minute: 60, outId: 0, inId: 0 } });
  }, [state.lock.isLocked, state.draft.events, dispatch, t]);

  const handleAddMove = useCallback(() => {
    if (state.lock.isLocked) return;
    dispatch({
      type: 'ADD_EVENT',
      event: { kind: 'move', minute: 60, playerId: 0, toSlot: 'CML' },
    });
  }, [state.lock.isLocked, dispatch]);

  // ---------------------------------------------------------------------
  // Preset handlers
  // ---------------------------------------------------------------------
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);

  const handleApplyPreset = useCallback(
    (preset: Preset) => {
      if (state.lock.isLocked) return;
      dispatch({ type: 'APPLY_PRESET', preset: hydratePreset(preset) });
      showToast('success', t('submitSuccess'), preset.name);
    },
    [state.lock.isLocked, dispatch, t],
  );

  const handleDeletePreset = useCallback(
    async (preset: Preset) => {
      if (state.lock.isLocked) return;
      try {
        await api.presets.remove(teamId, preset.id);
        setPresets((prev) => prev.filter((p) => p.id !== preset.id));
        showToast('success', t('presets.delete'), preset.name);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Delete failed', '');
      }
    },
    [state.lock.isLocked, teamId, t],
  );

  const handleConfirmSavePreset = useCallback(
    async (name: string, isDefault: boolean) => {
      try {
        const { serializePreset } = await import('../api-helpers');
        const payload = serializePreset(name, isDefault, stateRef.current.draft);
        const created = await api.presets.create(teamId, payload);
        setPresets((prev) => [created, ...prev]);
        setShowSaveDialog(false);
        showToast('success', t('presets.save'), name);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Save failed', '');
      }
    },
    [teamId, t],
  );

  // ---------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (state.lock.isLocked || state.submit.isSubmitting) return;
    if (!state.validation.isValid) {
      const first = state.validation.errors[0];
      if (first) showToast('error', t(`validation.${first.key}` as never), '');
      return;
    }
    dispatch({ type: 'SUBMIT_START' });
    try {
      const { serializeTactics } = await import('../api-helpers');
      const payload = serializeTactics(matchId, teamId, stateRef.current.draft);
      await api.matches.submitTactics(matchId, payload);
      dispatch({ type: 'SUBMIT_OK' });
      showToast('success', t('submitSuccess'), t('submitSuccessDesc', { formation, events: state.draft.events.length }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('submitError');
      dispatch({ type: 'SUBMIT_ERR', message: msg });
      showToast('error', t('submitError'), msg);
    }
  }, [state.lock.isLocked, state.submit.isSubmitting, state.validation, state.draft.events.length, matchId, teamId, dispatch, formation, t]);

  // ---------------------------------------------------------------------
  // Derived lists
  // ---------------------------------------------------------------------
  const benchMap: BenchMap = useMemo(() => {
    return {
      BENCH_GK: state.draft.bench.BENCH_GK ?? null,
      BENCH_CB: state.draft.bench.BENCH_CB ?? null,
      BENCH_FB: state.draft.bench.BENCH_FB ?? null,
      BENCH_W: state.draft.bench.BENCH_W ?? null,
      BENCH_CM: state.draft.bench.BENCH_CM ?? null,
      BENCH_FW: state.draft.bench.BENCH_FW ?? null,
    };
  }, [state.draft.bench]);

  const assignedIds = useMemo(() => {
    const s = new Set<number>();
    for (const id of Object.values(state.draft.lineup)) if (id !== null && id !== undefined) s.add(id);
    for (const id of Object.values(state.draft.bench)) if (id !== null && id !== undefined) s.add(id);
    return s;
  }, [state.draft]);

  const starters = useMemo(
    () => players.filter((p) => state.draft.lineup[p.id as never] !== null && state.draft.lineup[p.id as never] !== undefined),
    [players, state.draft.lineup],
  );
  // simpler: derive from ids in lineup only
  const starterIds = useMemo(() => new Set(Object.values(state.draft.lineup).filter((v): v is number => v !== null && v !== undefined) as number[]), [state.draft.lineup]);
  const benchOnlyIds = useMemo(() => new Set(Object.values(state.draft.bench).filter((v): v is number => v !== null && v !== undefined) as number[]), [state.draft.bench]);
  const startersList = useMemo(() => players.filter((p) => starterIds.has(p.id)), [players, starterIds]);
  const benchPlayersList = useMemo(() => players.filter((p) => benchOnlyIds.has(p.id)), [players, benchOnlyIds]);
  const pitchPlayers = startersList;

  // ---------------------------------------------------------------------
  // Header summary — "窄 · 防线低 · 双翼齐飞"
  // ---------------------------------------------------------------------
  const headerSummary = useMemo(() => {
    const width = t(`dimensions.pitchWidth.${state.draft.pitchWidth}` as never);
    const line = t(`dimensions.defensiveLine.${state.draft.defensiveLine}` as never);
    const tactic = state.draft.teamTactic
      ? t(`teamTactic.codes.${state.draft.teamTactic}` as never)
      : t('teamTactic.none');
    return `${width} · ${line} · ${tactic}`;
  }, [state.draft.pitchWidth, state.draft.defensiveLine, state.draft.teamTactic, t]);

  // An empty pitch computes to "0-0-0", which reads as a scoreline in a
  // header that already sits under a match title. Show an em dash instead.
  const formationLabel = startersList.length > 0 ? formation : '—';

  // ---------------------------------------------------------------------
  // Loading / error
  // ---------------------------------------------------------------------
  if (!dataReady) {
    // V11: a centred spinner replaced the whole three-column layout with a
    // single dot, so the page visibly jumped when data landed. The skeleton
    // keeps the header, the tab bar and the two columns where they will be.
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <div className="glass-panel rounded-2xl h-[68px] animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-lg bg-surface-container-low animate-pulse" />
          <div className="h-9 w-32 rounded-lg bg-surface-container-low animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
          <div className="flex flex-col gap-3">
            <div className="h-9 rounded-lg bg-surface-container-low animate-pulse" />
            <div className="aspect-[3/4] max-h-[calc(100vh-260px)] rounded-2xl bg-surface-container-low animate-pulse" />
            <div className="h-[92px] rounded-2xl bg-surface-container-low animate-pulse" />
          </div>
          <div className="h-[520px] rounded-2xl bg-surface-container-low animate-pulse" />
        </div>
      </div>
    );
  }
  if (dataError) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <AppIcon name="error" className="text-3xl text-error mb-2 block" />
        <p className="font-label text-xs tracking-widest uppercase text-on-surface">{dataError}</p>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-[1180px] flex-col gap-4 ${
        viewport === 'mobile' ? 'pb-24' : ''
      }`}
    >
      <EditorHeader
        formation={formationLabel}
        summary={headerSummary}
        isDirty={state.draft.isDirty}
        lock={state.lock}
        isSubmitting={state.submit.isSubmitting}
        canSubmit={state.validation.isValid && !state.lock.isLocked}
        onSubmit={handleSubmit}
        // On mobile the submit button lives in the sticky footer so it is
        // reachable from every step; a second one in the header would be two
        // primary buttons competing for the same thumb.
        showSubmit={viewport === 'desktop'}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {viewport === 'desktop' ? (
          <EditorTabs active={tab} onChange={handleTabChange} />
        ) : (
          <EditorStepper
            active={tab}
            onChange={handleTabChange}
            onSubmit={handleSubmit}
            canSubmit={state.validation.isValid && !state.lock.isLocked}
            isSubmitting={state.submit.isSubmitting}
          />
        )}
        <PresetDrawer
          presets={presets}
          activePresetId={state.draft.activePresetId}
          disabled={state.lock.isLocked}
          onApply={handleApplyPreset}
          onDelete={handleDeletePreset}
          onSaveNew={() => setShowSaveDialog(true)}
        />
      </div>
      <div
        id="editor-tabpanel"
        role={viewport === 'desktop' ? 'tabpanel' : undefined}
        aria-labelledby={
          viewport === 'desktop'
            ? `editor-tab-${tab === 'lineup' ? 'lineup' : 'tactics'}`
            : undefined
        }
      >
        <EditorWorkspace
          view={viewport}
          tab={tab}
          lineup={state.draft.lineup}
          bench={benchMap}
          playersById={playersById}
          players={players}
          assignedPlayerIds={assignedIds}
          pitchWidth={state.draft.pitchWidth}
          defensiveLine={state.draft.defensiveLine}
          teamTactic={state.draft.teamTactic}
          onTeamTacticChange={handleTeamTacticChange}
          events={state.draft.events}
          starters={startersList}
          benchPlayers={benchPlayersList}
          pitchPlayers={pitchPlayers}
          density={density}
          onDensityChange={setDensity}
          isDragging={drag.isDragging}
          isLocked={state.lock.isLocked}
          onPitchDrop={handlePitchDrop}
          onBenchDrop={handleBenchDrop}
          onRemovePitch={(slot) => dispatch({ type: 'REMOVE', slot })}
          onRemoveBench={(slot) => dispatch({ type: 'REMOVE', slot })}
          onDimensionChange={handleDimensionChange}
          onAddSub={handleAddSub}
          onAddMove={handleAddMove}
          onUpdateEvent={(index, patch) => dispatch({ type: 'UPDATE_EVENT', index, patch })}
          onRemoveEvent={(index) => dispatch({ type: 'REMOVE_EVENT', index })}
          onDragStart={drag.startFromSlot}
          onDragEnd={drag.end}
          onRosterDragStart={drag.startFromRoster}
        />
      </div>
      {showSaveDialog && (
        <SavePresetDialogComponent
          onCancel={() => setShowSaveDialog(false)}
          onConfirm={handleConfirmSavePreset}
        />
      )}
    </div>
  );
}

// ============================================================================
// Toast helper — emits a CustomEvent picked up by app's toast system (if any)
// ============================================================================

function showToast(level: 'success' | 'error' | 'warning' | 'info', title: string, message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('goalxi:toast', { detail: { level, title, message } }));
}

// ============================================================================
// Local save dialog wrapper (lazy import to keep this file readable)
// ============================================================================

const SavePresetDialogComponent = React.lazy(() =>
  import('../presets/SavePresetDialog').then((m) => ({ default: m.SavePresetDialog })),
);
