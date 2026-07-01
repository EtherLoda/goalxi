"use client";

/**
 * YouthTacticsEditor — simplified tactics editor for youth matches.
 *
 * Compared to the senior `TacticsEntryButton` + `PitchCanvas`:
 *  - No bench, no substitutions, no dimensions, no presets
 *  - Pure form-based: pick a formation, then assign one of your youth
 *    players to each of the 11 position slots
 *  - Submit to `POST /v1/youth-matches/:id/tactics`
 *  - Reads existing tactics on mount; if `tacticsLocked === true` or the
 *    deadline has passed, the form is rendered read-only.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type Match, type Player, type Tactics } from "@/lib/api";

type PositionKey = string;

/**
 * Formations used by the youth editor. Each formation has exactly 11
 * position slots with a short label rendered to the user. Keys are
 * unique within a formation and stable across reloads.
 */
const FORMATIONS: Record<
  string,
  { key: string; label: string; positions: Array<{ key: PositionKey; label: string }> }
> = {
  "4-3-3": {
    key: "4-3-3",
    label: "4-3-3",
    positions: [
      { key: "GK", label: "GK" },
      { key: "LB", label: "LB" },
      { key: "LCB", label: "CB" },
      { key: "RCB", label: "CB" },
      { key: "RB", label: "RB" },
      { key: "LCM", label: "CM" },
      { key: "CM", label: "CM" },
      { key: "RCM", label: "CM" },
      { key: "LW", label: "LW" },
      { key: "ST", label: "ST" },
      { key: "RW", label: "RW" },
    ],
  },
  "4-4-2": {
    key: "4-4-2",
    label: "4-4-2",
    positions: [
      { key: "GK", label: "GK" },
      { key: "LB", label: "LB" },
      { key: "LCB", label: "CB" },
      { key: "RCB", label: "CB" },
      { key: "RB", label: "RB" },
      { key: "LM", label: "LM" },
      { key: "LCM", label: "CM" },
      { key: "RCM", label: "CM" },
      { key: "RM", label: "RM" },
      { key: "LST", label: "ST" },
      { key: "RST", label: "ST" },
    ],
  },
  "3-5-2": {
    key: "3-5-2",
    label: "3-5-2",
    positions: [
      { key: "GK", label: "GK" },
      { key: "LCB", label: "CB" },
      { key: "CB", label: "CB" },
      { key: "RCB", label: "CB" },
      { key: "LWB", label: "LWB" },
      { key: "LCM", label: "CM" },
      { key: "CM", label: "CM" },
      { key: "RCM", label: "CM" },
      { key: "RWB", label: "RWB" },
      { key: "LST", label: "ST" },
      { key: "RST", label: "ST" },
    ],
  },
  "4-2-3-1": {
    key: "4-2-3-1",
    label: "4-2-3-1",
    positions: [
      { key: "GK", label: "GK" },
      { key: "LB", label: "LB" },
      { key: "LCB", label: "CB" },
      { key: "RCB", label: "CB" },
      { key: "RB", label: "RB" },
      { key: "CDM1", label: "CDM" },
      { key: "CDM2", label: "CDM" },
      { key: "LAM", label: "LAM" },
      { key: "CAM", label: "CAM" },
      { key: "RAM", label: "RAM" },
      { key: "ST", label: "ST" },
    ],
  },
};

const FORMATION_KEYS = Object.keys(FORMATIONS);
const DEFAULT_FORMATION = "4-3-3";

/** Minutes before kickoff after which the backend locks tactics. */
const TACTICS_DEADLINE_MIN = 10;

/**
 * Small toggle-row used for the 3 tactical dimensions (tempo /
 * pitch width / defensive line). Visually mirrors the formation
 * picker above so the editor reads as one cohesive block.
 */
function TacticalDimensionRow<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-[#91b2a6] mb-2">
        {label}
      </p>
      <div className="inline-flex rounded-lg border border-white/5 overflow-hidden flex-wrap">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={
              value === o.value
                ? "px-3 py-1.5 bg-[#a1ffc2] text-[#001e17] text-xs font-bold uppercase tracking-wider"
                : "px-3 py-1.5 text-[#91b2a6] hover:bg-white/5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  match: Match;
  /** Which side of the fixture the user controls (so we submit with the right teamId). */
  side: "home" | "away";
  /** Initial tactics if the user already submitted some; null otherwise. */
  initialTactics: Tactics | null;
  /** All youth players on the user's roster. */
  availablePlayers: Player[];
  /** Translation hook for "youth.matches" namespace. */
  tMatches: ReturnType<typeof useTranslations>;
  /** Translation hook for "common" namespace (loading/error). */
  tCommon: ReturnType<typeof useTranslations>;
  /** Called after a successful submit so the parent can refetch. */
  onSubmitted?: () => void;
}

export default function YouthTacticsEditor({
  match,
  side,
  initialTactics,
  availablePlayers,
  tMatches,
  tCommon,
  onSubmitted,
}: Props) {
  const tForm = useTranslations("youth.matches.editor");

  // Pre-pick a formation. If existing tactics match one of the known
  // formations, keep it; otherwise default to 4-3-3.
  const initialFormation = useMemo(() => {
    if (initialTactics && FORMATIONS[initialTactics.formation]) {
      return initialTactics.formation;
    }
    return DEFAULT_FORMATION;
  }, [initialTactics]);

  const [formation, setFormation] = useState<string>(initialFormation);
  const [lineup, setLineup] = useState<Record<string, string>>(() => {
    if (initialTactics) return { ...initialTactics.lineup };
    return {};
  });
  // [WAVE B4] Tactical dimensions are now user-editable. Initial
  // values come from existing tactics (if any); otherwise we fall
  // back to the same balanced defaults the editor used to hardcode.
  const [tempo, setTempo] = useState(initialTactics?.tempo ?? "balanced");
  const [pitchWidth, setPitchWidth] = useState(
    initialTactics?.pitchWidth ?? "balanced",
  );
  const [defensiveLine, setDefensiveLine] = useState(
    initialTactics?.defensiveLine ?? "mid",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock conditions:
  //  1. `match.tacticsLocked === true` (server already locked it)
  //  2. now >= scheduledAt - TACTICS_DEADLINE_MIN
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const scheduledAtMs = new Date(match.scheduledAt).getTime();
  const deadlineMs = scheduledAtMs - TACTICS_DEADLINE_MIN * 60 * 1000;
  const pastDeadline = now >= deadlineMs;
  const isLocked = match.tacticsLocked || pastDeadline;

  // When formation changes, drop positions that no longer exist (and
  // preserve ones that still do).
  useEffect(() => {
    const newKeys = new Set(
      FORMATIONS[formation].positions.map((p) => p.key),
    );
    setLineup((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (newKeys.has(k)) next[k] = v;
      }
      return next;
    });
  }, [formation]);

  const positions = FORMATIONS[formation].positions;
  const filledCount = positions.filter(
    (p) => lineup[p.key] && lineup[p.key].length > 0,
  ).length;
  const isComplete = filledCount === positions.length;
  const duplicateWarning = useMemo(() => {
    const seen = new Map<string, number>();
    for (const id of Object.values(lineup)) {
      if (!id) continue;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .filter(([, n]) => n > 1)
      .map(([id]) => id);
  }, [lineup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !isComplete || duplicateWarning.length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // [RFC 0001] The senior endpoint uses `teamId` (the senior team's
      // id, which doubles as the youth team id per the migration
      // backfill). No more separate youthTeamId.
      const teamId =
        side === "home" ? match.homeTeamId : match.awayTeamId;
      await api.matches.submitTactics(match.id, {
        formation,
        lineup,
        teamId,
        // [WAVE B4] Driven by user-controlled state rather than the
        // hardcoded balanced/mid defaults the editor used to ship.
        tempo,
        pitchWidth,
        defensiveLine,
        substitutions: [],
        instructions: {},
        presetId: null,
      });
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setSubmitting(false);
    }
  };

  // Helper: a player's id -> display name, restricted to those in the
  // available roster (so we can offer them in dropdowns).
  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of availablePlayers) map.set(p.id, p);
    return map;
  }, [availablePlayers]);

  if (availablePlayers.length < 11) {
    return (
      <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-4 text-sm text-[#fbbf24] font-space">
        {tForm("needMorePlayers", { have: availablePlayers.length, need: 11 })}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Formation picker */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-[#91b2a6] mb-2">
          {tForm("formation")}
        </p>
        <div className="inline-flex rounded-lg border border-white/5 overflow-hidden flex-wrap">
          {FORMATION_KEYS.map((fk) => (
            <button
              type="button"
              key={fk}
              disabled={isLocked}
              onClick={() => setFormation(fk)}
              className={
                formation === fk
                  ? "px-3 py-1.5 bg-[#a1ffc2] text-[#001e17] text-xs font-bold uppercase tracking-wider"
                  : "px-3 py-1.5 text-[#91b2a6] hover:bg-white/5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              }
            >
              {fk}
            </button>
          ))}
        </div>
      </div>

      {/* [WAVE B4] Tactical dimensions. Mirrors the formation-picker
       *  styling (button-row toggles). Falls back to "balanced"/"mid"
       *  state when no `initialTactics` exist, so existing youth
       *  submissions stay observable. */}
      <TacticalDimensionRow
        label={tForm("tempo.label") as string}
        value={tempo}
        options={[
          { value: "slow", label: tForm("tempo.slow") as string },
          { value: "balanced", label: tForm("tempo.balanced") as string },
          { value: "fast", label: tForm("tempo.fast") as string },
        ]}
        disabled={isLocked}
        onChange={setTempo}
      />
      <TacticalDimensionRow
        label={tForm("pitchWidth.label") as string}
        value={pitchWidth}
        options={[
          { value: "narrow", label: tForm("pitchWidth.narrow") as string },
          {
            value: "balanced",
            label: tForm("pitchWidth.balanced") as string,
          },
          { value: "wide", label: tForm("pitchWidth.wide") as string },
        ]}
        disabled={isLocked}
        onChange={setPitchWidth}
      />
      <TacticalDimensionRow
        label={tForm("defensiveLine.label") as string}
        value={defensiveLine}
        options={[
          { value: "low", label: tForm("defensiveLine.low") as string },
          { value: "mid", label: tForm("defensiveLine.mid") as string },
          { value: "high", label: tForm("defensiveLine.high") as string },
        ]}
        disabled={isLocked}
        onChange={setDefensiveLine}
      />

      {/* Position slots — 11 select dropdowns in a CSS pitch layout */}
      <div className="rounded-xl border border-white/5 bg-[#001e17] p-3">
        <PitchGrid
          formation={formation}
          lineup={lineup}
          positions={positions}
          availablePlayers={availablePlayers}
          onChange={(key, playerId) =>
            setLineup((prev) => ({ ...prev, [key]: playerId }))
          }
          disabled={isLocked}
        />
      </div>

      {/* Footer: status + submit */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[#91b2a6] font-space">
          {isLocked ? (
            <span className="text-[#fbbf24] font-bold">
              ⏰ {tForm("locked")}
            </span>
          ) : (
            <span>
              {tForm("deadline")}:{" "}
              <span className="text-[#d3f5e8] font-bold">
                {new Date(deadlineMs).toLocaleString()}
              </span>{" "}
              ({tForm("minutesLeft", { minutes: TACTICS_DEADLINE_MIN })})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              isComplete && duplicateWarning.length === 0
                ? "text-[10px] uppercase tracking-wider font-bold text-[#a1ffc2]"
                : "text-[10px] uppercase tracking-wider font-bold text-[#91b2a6]"
            }
          >
            {filledCount}/{positions.length}
          </span>
          <button
            type="submit"
            disabled={
              isLocked || !isComplete || duplicateWarning.length > 0 || submitting
            }
            className={
              isLocked || !isComplete || duplicateWarning.length > 0
                ? "px-4 py-2 rounded-lg bg-[#2f4e44]/30 text-[#91b2a6] text-sm font-bold uppercase tracking-wider cursor-not-allowed"
                : "inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#a1ffc2] text-[#001e17] text-sm font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors"
            }
          >
            {submitting ? (
              <span className="material-symbols-outlined text-[14px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">save</span>
            )}
            {tMatches("submitTactics")}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-error font-space">{error}</div>
      )}
      {!isComplete && !isLocked && (
        <p className="text-[11px] text-[#91b2a6] font-space">
          {tForm("incomplete")}
        </p>
      )}
      {duplicateWarning.length > 0 && (
        <p className="text-[11px] text-error font-space">
          {tForm("duplicatePlayer")}
        </p>
      )}
    </form>
  );
}

// ---------- PitchGrid ----------

/**
 * Renders the 11 position slots in a pitch-shaped CSS grid. We use a
 * simple 4-row × N-column layout (GK at top, defenders, midfielders,
 * forwards at bottom) rather than full SVG — readable, responsive, no
 * asset weight. The exact (row, col) per position is hard-coded per
 * formation.
 */
const PITCH_LAYOUT: Record<
  string,
  Array<{ key: string; row: number; col: number }>
> = {
  "4-3-3": [
    { key: "GK", row: 0, col: 2 },
    { key: "LB", row: 1, col: 0 },
    { key: "LCB", row: 1, col: 1 },
    { key: "RCB", row: 1, col: 3 },
    { key: "RB", row: 1, col: 4 },
    { key: "LCM", row: 2, col: 1 },
    { key: "CM", row: 2, col: 2 },
    { key: "RCM", row: 2, col: 3 },
    { key: "LW", row: 3, col: 0 },
    { key: "ST", row: 3, col: 2 },
    { key: "RW", row: 3, col: 4 },
  ],
  "4-4-2": [
    { key: "GK", row: 0, col: 2 },
    { key: "LB", row: 1, col: 0 },
    { key: "LCB", row: 1, col: 1 },
    { key: "RCB", row: 1, col: 3 },
    { key: "RB", row: 1, col: 4 },
    { key: "LM", row: 2, col: 0 },
    { key: "LCM", row: 2, col: 1 },
    { key: "RCM", row: 2, col: 3 },
    { key: "RM", row: 2, col: 4 },
    { key: "LST", row: 3, col: 1 },
    { key: "RST", row: 3, col: 3 },
  ],
  "3-5-2": [
    { key: "GK", row: 0, col: 2 },
    { key: "LCB", row: 1, col: 1 },
    { key: "CB", row: 1, col: 2 },
    { key: "RCB", row: 1, col: 3 },
    { key: "LWB", row: 2, col: 0 },
    { key: "LCM", row: 2, col: 1 },
    { key: "CM", row: 2, col: 2 },
    { key: "RCM", row: 2, col: 3 },
    { key: "RWB", row: 2, col: 4 },
    { key: "LST", row: 3, col: 1 },
    { key: "RST", row: 3, col: 3 },
  ],
  "4-2-3-1": [
    { key: "GK", row: 0, col: 2 },
    { key: "LB", row: 1, col: 0 },
    { key: "LCB", row: 1, col: 1 },
    { key: "RCB", row: 1, col: 3 },
    { key: "RB", row: 1, col: 4 },
    { key: "CDM1", row: 2, col: 1 },
    { key: "CDM2", row: 2, col: 3 },
    { key: "LAM", row: 3, col: 0 },
    { key: "CAM", row: 3, col: 2 },
    { key: "RAM", row: 3, col: 4 },
    { key: "ST", row: 4, col: 2 },
  ],
};

const COLS = 5; // 5-column grid supports 4-3-3 / 4-4-2 / 3-5-2 / 4-2-3-1

function PitchGrid({
  formation,
  lineup,
  positions,
  availablePlayers,
  onChange,
  disabled,
}: {
  formation: string;
  lineup: Record<string, string>;
  positions: Array<{ key: string; label: string }>;
  availablePlayers: Player[];
  onChange: (key: string, playerId: string) => void;
  disabled: boolean;
}) {
  const layout = PITCH_LAYOUT[formation] ?? [];
  const totalRows = Math.max(...layout.map((c) => c.row), 0) + 1;

  // Build player dropdown options. Exclude the currently-selected
  // playerId for OTHER slots so the same name can be assigned to a
  // different position only when the user has < 11 players.
  const usedIds = new Set(Object.values(lineup).filter(Boolean));

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: totalRows }).map((_, rowIdx) => {
        const cols = layout.filter((c) => c.row === rowIdx);
        return (
          <React.Fragment key={rowIdx}>
            {cols.map((c) => {
              const pos = positions.find((p) => p.key === c.key);
              if (!pos) return null;
              const selected = lineup[c.key] ?? "";
              return (
                <div
                  key={c.key}
                  className="col-span-1 flex flex-col gap-1"
                  style={{ gridColumn: c.col + 1 }}
                >
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[#91b2a6]">
                    {pos.label}
                  </span>
                  <select
                    disabled={disabled}
                    value={selected}
                    onChange={(e) => onChange(c.key, e.target.value)}
                    className="w-full bg-[#00251c] border border-white/10 rounded px-2 py-1.5 text-xs text-[#d3f5e8] font-space disabled:opacity-50"
                  >
                    <option value="">— select —</option>
                    {availablePlayers.map((p) => {
                      const isUsedElsewhere =
                        usedIds.has(p.id) && selected !== p.id;
                      return (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={isUsedElsewhere}
                        >
                          {p.name}
                          {p.isGoalkeeper ? " (GK)" : ""}
                          {isUsedElsewhere ? " (used)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}