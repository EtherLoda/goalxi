/**
 * Specialty Attribution Recorder — RFC 0003.
 *
 * Captures which player specialties actually moved a multiplier on
 * a per-event basis, so the FE can surface "空霸发威！" / "扑救
 * 专家立功！" without re-running the engine. See
 * `docs/rfcs/0003-specialty-attribution.md` for the full design.
 *
 * ## Why a separate recorder (not push into leaf multipliers)
 *
 * The 23 leaf multipliers in `specialty.system.ts` are called from
 * many contexts:
 *
 *   - Per-event resolution (resolveShot / resolveSave / resolveFoul /
 *     resolveInjury) — these emit a `MatchEventEntity` and want
 *     attribution recorded.
 *   - Aggregate path (`Team.ts` `attackLaneMultiplier` / per-snapshot
 *     lane-strength computation) — called 11 players × 3 lanes ×
 *     18 snapshots per match = ~600 calls, none of which correspond
 *     to a single event.
 *   - Random weighted selection (`selectShooterWeight`,
 *     `selectShooterReboundWeight`...) — these are "weights" not
 *     "effects"; the FE has no concept of "X's specialty was
 *     considered but not picked".
 *
 * Centralizing recording in a recorder passed only to the
 * per-event resolution path keeps the leaf functions pure (zero
 * side effect when no recorder is passed) and makes it impossible
 * to accidentally record on aggregate / selection paths.
 *
 * ## Usage
 *
 * ```typescript
 * // In resolveShot / resolveSave / resolveFoul / resolveInjury:
 * const recorder = new SpecialtyAttributionRecorder();
 *
 * const headerMult = shotHeaderMultiplier(shooter);
 * recorder?.record(shooter, 'shot_header', 'shooter', true, headerMult);
 *
 * const gkSaveMult = gkSaveMultiplier(gk);
 * recorder?.record(gk, 'gk_save', 'gk', false, gkSaveMult);
 *
 * // ... outcome determined, event object built ...
 * recorder.attachTo(event);
 * // → event.specialtyContributions = [...]
 * ```
 *
 * ## Multiplayer dedup
 *
 * The same player can fire multiple hooks on the same event
 * (rare but possible — e.g. an AERIAL_THREAT on `shot_header`
 * AND `shot_one_on_one` on the same play). We **do not** dedup;
 * each fire gets its own entry so the FE can show "+14% on header"
 * AND "+18% on 1v1" if both apply. The FE renders them
 * cumulatively or picks one to display.
 *
 * ## isPrimary guarantee
 *
 * The engine caller is responsible for marking at most one entry
 * per event with `isPrimary: true`. This method does NOT enforce
 * that — the caller does, because only the caller knows the
 * semantic ("the goal scorer's primary entry is on the goal
 * event"). Misuse is a bug; the engine spec covers the contract.
 */

import { Player } from '../../types/player.types';
import type { SpecialtyContribution } from '@goalxi/database';
import type { SpecialtyEvent } from './specialty.system';

/**
 * Per-event recorder. Created fresh for every emitted event in
 * the 4 emit paths (`resolveShot` / `resolveSave` / `resolveFoul` /
 * `resolveInjury`). Zero cost when the engine caller doesn't
 * create one (the leaf multipliers stay pure).
 */
export class SpecialtyAttributionRecorder {
    private readonly contributions: SpecialtyContribution[] = [];

    /**
     * Record that `player`'s specialty fired on `effectKey` with
     * the given `multiplier`. No-op when:
     *   - `multiplier === 1.0` (the leaf's "no effect" return —
     *     most calls go through this path and stay free)
     *   - `player.attributes.coreSpecialty` is null/undefined
     *     (the 50% of players with no specialty)
     *   - the specialty is deprecated (legacy v1 data, no
     *     engine effect — but we still skip recording to keep
     *     the array clean)
     */
    record(
        player: Player,
        effectKey: SpecialtyEvent,
        role: SpecialtyContribution['role'],
        isPrimary: boolean,
        multiplier: number,
    ): void {
        if (multiplier === 1.0) return;
        const code = player?.attributes?.coreSpecialty;
        if (code == null) return;
        // Deprecated pool (LONG_SHOT, POSITIONING_MASTER, etc.) is
        // rendered as "—" in the FE and has no engine effect, so
        // it can't have fired. Skipping here is a defensive guard
        // — the leaf already short-circuits deprecated codes.
        this.contributions.push({
            playerId: player.id,
            specialtyCode: code,
            tier: player.attributes.coreSpecialtyTier ?? 'BRONZE',
            effectKey,
            multiplier,
            role,
            isPrimary,
        });
    }

    /**
     * Snapshot the current contributions and return a frozen
     * array suitable for attaching to the event payload. Returns
     * `undefined` (NOT `[]`) when nothing fired — the FE
     * short-circuits on `undefined` and the migration's partial
     * indexes have a `WHERE NOT NULL` filter, so `undefined`
     * (which serializes to absent) is the desired "no effect"
     * signal.
     */
    snapshot(): SpecialtyContribution[] | undefined {
        if (this.contributions.length === 0) return undefined;
        // Order: primary first (D8 — FE reads index 0 for headline).
        // Within each tier (primary / non-primary), preserve
        // insertion order so the FE renders in the order the
        // engine saw them.
        const sorted: SpecialtyContribution[] = [...this.contributions].sort((a, b) => {
            if (a.isPrimary && !b.isPrimary) return -1;
            if (!a.isPrimary && b.isPrimary) return 1;
            return 0;
        });
        return sorted;
    }

    /**
     * Attach the snapshot to the given event object in place.
     * No-op when nothing fired. Designed to be called once per
     * event, just before the event is appended to the emit
     * queue.
     */
    attachTo(event: { specialtyContributions?: SpecialtyContribution[] }): void {
        const snap = this.snapshot();
        if (snap) {
            event.specialtyContributions = snap;
        }
    }
}
