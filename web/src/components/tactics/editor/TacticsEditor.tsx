'use client';

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
  type BenchMap,
  type BenchSlot,
  type EditorState,
  type LockState,
  type MatchStatus,
  type PitchSlot,
  type PositionKey,
  type TacticsDraft,
  createEmptyDraft,
} from '../types';
import { EditorBentoGrid } from './EditorBentoGrid';
import { EditorHeader } from './EditorHeader';

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
    const m = new Map<string, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const validatorPlayersById = useMemo(() => {
    const m = new Map<string, ValidatorPlayer>();
    for (const p of players) m.set(p.id, { id: p.id, isGoalkeeper: p.isGoalkeeper, name: p.name });
    return m;
  }, [players]);

  const teamPlayerIds = useMemo(() => new Set(players.map((p) => p.id)), [players]);

  useEffect(() => {
    const ctx: ValidationContext = {
      draft: state.draft,
      teamPlayerIds,
      playersById: validatorPlayersById,
    };
    dispatch({ type: 'REVALIDATE', ctx });
  }, [state.draft, teamPlayerIds, validatorPlayersById, dispatch]);

  // ---------------------------------------------------------------------
  // Drag tracking
  // ---------------------------------------------------------------------
  const [isDragging, setIsDragging] = React.useState(false);
  const [draggingFrom, setDraggingFrom] = React.useState<PositionKey | null>(null);

  const handleRosterDragStart = useCallback((playerId: string) => {
    setIsDragging(true);
    setDraggingFrom(null);
  }, []);

  const handleSlotDragStart = useCallback((slot: PositionKey) => {
    setIsDragging(true);
    setDraggingFrom(slot);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggingFrom(null);
  }, []);

  // ---------------------------------------------------------------------
  // Drop handlers
  // ---------------------------------------------------------------------
  const handlePitchDrop = useCallback(
    (toSlot: PitchSlot, playerId: string, fromSlot: PositionKey | null) => {
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
    (toSlot: BenchSlot, playerId: string, fromSlot: PositionKey | null) => {
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
    (key: 'tempo' | 'pitchWidth' | 'defensiveLine', value: string) => {
      if (state.lock.isLocked) return;
      dispatch({ type: 'SET_DIMENSION', key, value: value as never });
    },
    [state.lock.isLocked, dispatch],
  );

  // ---------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------
  const handleAddSub = useCallback(() => {
    if (state.lock.isLocked) return;
    dispatch({ type: 'ADD_EVENT', event: { kind: 'sub', minute: 60, outId: '', inId: '' } });
  }, [state.lock.isLocked, dispatch]);

  const handleAddMove = useCallback(() => {
    if (state.lock.isLocked) return;
    dispatch({
      type: 'ADD_EVENT',
      event: { kind: 'move', minute: 60, playerId: '', toSlot: 'CM1' },
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
    const s = new Set<string>();
    for (const id of Object.values(state.draft.lineup)) if (id) s.add(id);
    for (const id of Object.values(state.draft.bench)) if (id) s.add(id);
    return s;
  }, [state.draft]);

  const starters = useMemo(
    () => players.filter((p) => state.draft.lineup[p.id as never] || (Object.values(state.draft.lineup).includes(p.id) && !state.draft.bench.BENCH_GK?.includes(p.id))),
    [players, state.draft.lineup, state.draft.bench],
  );
  // simpler: derive from ids in lineup only
  const starterIds = useMemo(() => new Set(Object.values(state.draft.lineup).filter((v): v is string => Boolean(v))), [state.draft.lineup]);
  const benchOnlyIds = useMemo(() => new Set(Object.values(state.draft.bench).filter((v): v is string => Boolean(v))), [state.draft.bench]);
  const startersList = useMemo(() => players.filter((p) => starterIds.has(p.id)), [players, starterIds]);
  const benchPlayersList = useMemo(() => players.filter((p) => benchOnlyIds.has(p.id)), [players, benchOnlyIds]);
  const pitchPlayers = startersList;

  // ---------------------------------------------------------------------
  // Loading / error
  // ---------------------------------------------------------------------
  if (!dataReady) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    );
  }
  if (dataError) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <span className="material-symbols-outlined text-3xl text-error mb-2 block">error</span>
        <p className="font-label text-xs tracking-widest uppercase text-on-surface">{dataError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <EditorHeader
        formation={formation}
        isDirty={state.draft.isDirty}
        lock={state.lock}
        isSubmitting={state.submit.isSubmitting}
        canSubmit={state.validation.isValid && !state.lock.isLocked}
        onSubmit={handleSubmit}
      />
      {state.validation.errors.length > 0 && !state.validation.isValid && (
        <div className="glass-panel rounded-2xl p-3 border border-error/30 bg-error/10 flex items-center gap-2">
          <span className="material-symbols-outlined text-error">warning</span>
          <ul className="flex-1 space-y-0.5">
            {state.validation.errors.slice(0, 3).map((e, idx) => (
              <li key={idx} className="font-label text-[10px] tracking-widest uppercase text-error">
                {t(`validation.${e.key}` as never, e.params as never)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <EditorBentoGrid
        lineup={state.draft.lineup}
        bench={benchMap}
        playersById={playersById}
        players={players}
        assignedPlayerIds={assignedIds}
        tempo={state.draft.tempo}
        pitchWidth={state.draft.pitchWidth}
        defensiveLine={state.draft.defensiveLine}
        events={state.draft.events}
        starters={startersList}
        benchPlayers={benchPlayersList}
        pitchPlayers={pitchPlayers}
        presets={presets}
        activePresetId={state.draft.activePresetId}
        isDragging={isDragging}
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
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
        onSavePreset={() => setShowSaveDialog(true)}
        onDragStart={handleSlotDragStart}
        onDragEnd={handleDragEnd}
        onRosterDragStart={handleRosterDragStart}
      />
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
