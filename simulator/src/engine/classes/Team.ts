import {
  TacticalPlayer,
  Lane,
  Phase,
  TeamSnapshot,
} from '../types/simulation.types';
import { AttributeCalculator } from '../utils/attribute-calculator';
import { gkSetPieceRating } from '@goalxi/database';
import { ConditionSystem } from '../systems/condition.system';
import { Player } from '../../types/player.types';
import { PitchWidth } from '../types/tactics-config';
import { WIDTH_MODIFIERS } from '../tactics/tactics-presets';
import { attackLaneMultiplier, commandDefenseMultiplier, defenseLaneMultiplier, gkSaveMultiplier } from '../systems/specialty.system';

export class Team {
  private snapshot: TeamSnapshot | null = null;
  public playerFitness: Float32Array;
  private playerToIdx: Map<number, number> = new Map();
  /**
   * Players who have already been injured during the current
   * match. The injury system uses this to skip a player that
   * was already picked for an injury event earlier in the
   * match — without it, a second `checkAndGenerateInjury`
   * call could re-injure the same player, stacking injury rows
   * and confusing the post-match notification flow (P2-#10).
   *
   * Per-instance, so a fresh `Team` per match starts with an
   * empty set.
   */
  public injuredThisMatch: Set<number> = new Set();

  constructor(
    public name: string,
    public players: TacticalPlayer[],
    public doctorLevel: number = 0,
  ) {
    this.playerFitness = new Float32Array(players.length);
    // Initialize Fitness to starting Stamina
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const player = p.player as Player;
      this.playerToIdx.set(player.id, i);
      this.playerFitness[i] = player.currentStamina || 3.0;
      p.entryMinute = 0;
      p.teamName = this.name;
    }
  }

  /**
   * Get player energy by player ID
   */
  getPlayerEnergy(playerId: number): number | undefined {
    const idx = this.playerToIdx.get(playerId);
    return idx !== undefined ? this.playerFitness[idx] : undefined;
  }

  /**
   * Updates player fitness levels based on minutes played.
   */
  updateCondition(minutesDelta: number, isHalfTime: boolean = false) {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.isSentOff) continue;

      const player = p.player as Player;
      let current = this.playerFitness[i];

      // Decay
      if (minutesDelta > 0) {
        current -= ConditionSystem.calculateFitnessDecay(minutesDelta);
      }

      // Recovery
      if (isHalfTime) {
        current += ConditionSystem.calculateRecovery(player.currentStamina);
      }

      // In-match cap is 6.0 — the DB-side `STAMINA_MAX` is 5.99
      // (see libs/database/src/services/stamina-calculator.ts), so a
      // player at full 5.99 can recover up to 6.0 in one half-time
      // break. The 1.0 floor keeps the simulator's fitness factor
      // from going degenerate when a player runs out of gas.
      if (current > 6.0) current = 6.0;
      if (current < 1.0) current = 1.0;

      this.playerFitness[i] = current;
    }
  }

  /**
   * Generates a new snapshot of effective team strengths.
   * 使用缓存的贡献值，只需应用multiplier
   * @param minute 当前比赛分钟，用于计算clutch_player加成
   */
  updateSnapshot(minute: number = 0, pitchWidth?: PitchWidth) {
    const lanes: Lane[] = ['left', 'center', 'right'];
    const laneStrengths: TeamSnapshot['laneStrengths'] = {
      left: { attack: 0, defense: 0, possession: 0 },
      center: { attack: 0, defense: 0, possession: 0 },
      right: { attack: 0, defense: 0, possession: 0 },
    };

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.isSentOff) continue;

      const player = p.player as Player;
      const currentFit = this.playerFitness[i];

      // Calculate Performance Multiplier
      let multiplier = ConditionSystem.calculateMultiplier(
        currentFit,
        player.currentStamina,
        player.form,
        player.experience,
      );

      // v2 SPEEDSTER / first-light boost (formerly FSTRT) is folded
      // into the snapshot's per-lane strength via the pace
      // contribution hook. We don't add an early-minute multiplier
      // here because (a) it's already in the snapshot, and
      // (b) the COMPOSED late-game branch is a *shoot-rating* buff
      // (see simulateKeyMoment), not a lane-strength multiplier —
      // keeping it out of the lane loop preserves the "decision
      // quality" scope from the spec.

      // HOIST: `attackLaneMultiplier` / `defenseLaneMultiplier` are
      // pure functions of `player.coreSpecialty` + `coreSpecialtyTier`
      // — both are player attributes that don't change during a
      // match. The legacy code recomputed them 3× per lane × 2
      // (att/def) = 6 times per player per snapshot (2376 calls /
      // match on an 11-vs-11 line-up × 18 snapshots), each doing 5
      // Map.gets + a Math.pow tier scaling. Hoisting them out of
      // the lane loop reduces that to 2 calls per player per
      // snapshot (792 calls / match — a 67% reduction) with no
      // behavior change. See
      // `docs/specialty-v2-design.md` for the v2 hook design.
      const attLaneMult = attackLaneMultiplier(player);
      const defLaneMult = defenseLaneMultiplier(player);

      // 使用calculateAndCacheContribution，自动缓存
      for (const lane of lanes) {
        const att = AttributeCalculator.calculateAndCacheContribution(
          player,
          p.positionKey,
          lane,
          'attack',
        );
        const def = AttributeCalculator.calculateAndCacheContribution(
          player,
          p.positionKey,
          lane,
          'defense',
        );
        const poss = AttributeCalculator.calculateAndCacheContribution(
          player,
          p.positionKey,
          lane,
          'possession',
        );

        laneStrengths[lane].attack += att * multiplier * attLaneMult;
        laneStrengths[lane].defense += def * multiplier * defLaneMult;
        laneStrengths[lane].possession += poss * multiplier;
      }
    }

    // Apply pitch width modifiers to attack, defense, and possession
    // NARROW: concentrate through center; WIDE: spread to flanks
    const widthMults = WIDTH_MODIFIERS[pitchWidth ?? PitchWidth.BALANCED];
    for (const lane of lanes) {
      laneStrengths[lane].attack *= widthMults[lane];
      laneStrengths[lane].defense *= widthMults[lane];
      laneStrengths[lane].possession *= widthMults[lane];
    }

    // v2 SWEEPER_KEEPER aura — boosts the whole team's defense lane
    // strength. The GK's own commandDefenseMultiplier is applied
    // here (the GK isn't in the players[] loop above because we
    // skip GK contributions to lane strength). 1.0 / 1.05 / 1.07
    // for B/S/G.
    const sweeperGk = this.getGoalkeeper();
    if (sweeperGk && !sweeperGk.isSentOff) {
      const cmdMult = commandDefenseMultiplier(sweeperGk.player as Player);
      if (cmdMult > 1.0) {
        for (const lane of lanes) {
          laneStrengths[lane].defense *= cmdMult;
        }
      }
    }

    // Round all lane strengths
    const roundedLaneStrengths: TeamSnapshot['laneStrengths'] = {
      left: {
        attack: parseFloat(laneStrengths.left.attack.toFixed(2)),
        defense: parseFloat(laneStrengths.left.defense.toFixed(2)),
        possession: parseFloat(laneStrengths.left.possession.toFixed(2)),
      },
      center: {
        attack: parseFloat(laneStrengths.center.attack.toFixed(2)),
        defense: parseFloat(laneStrengths.center.defense.toFixed(2)),
        possession: parseFloat(laneStrengths.center.possession.toFixed(2)),
      },
      right: {
        attack: parseFloat(laneStrengths.right.attack.toFixed(2)),
        defense: parseFloat(laneStrengths.right.defense.toFixed(2)),
        possession: parseFloat(laneStrengths.right.possession.toFixed(2)),
      },
    };

    // GK Rating - 使用缓存
    const gk = this.getGoalkeeper();
    let gkRating = 100;
    if (gk && !gk.isSentOff) {
      const player = gk.player as Player;
      const idx = this.playerToIdx.get(player.id);
      const currentFit = this.playerFitness[idx];
      const multiplier = ConditionSystem.calculateMultiplier(
        currentFit,
        player.currentStamina,
        player.form,
        player.experience,
      );

      const rawRating =
        AttributeCalculator.calculateAndCacheGKSaveRating(player);
      // v2 SAVING_MASTER — multiplies the GK's save rating. 1.0 / 1.10 /
      // 1.40 for B/S/G. Applied at the snapshot level (rather than
      // inside calculateAndCacheGKSaveRating) so the raw rating stays
      // in the cache untransformed, which keeps the AttributeCalculator
      // pure and testable.
      const specialtyMult = gkSaveMultiplier(player);
      gkRating = parseFloat((rawRating * multiplier * specialtyMult).toFixed(2));
    }

    this.snapshot = {
      laneStrengths: roundedLaneStrengths,
      gkRating,
    };
  }

  /**
   * Marks a player as sent off.
   */
  sendOffPlayer(playerId: number) {
    const idx = this.playerToIdx.get(playerId);
    if (idx !== undefined) {
      const p = this.players[idx];
      p.isSentOff = true;
      this.playerFitness[idx] = 1.0; // Minimal fitness
    }
  }

  /**
   * Performs a substitution.
   */
  substitutePlayer(outId: number, inTacticalPlayer: TacticalPlayer) {
    const index = this.players.findIndex(
      (p) => (p.player as Player).id === outId,
    );
    if (index !== -1) {
      const outPlayer = this.players[index];
      if (outPlayer.isSentOff) return; // Cannot sub out a sent off player

      // Add new player
      const newPlayer = inTacticalPlayer.player as Player;

      // Map index to new player
      this.playerToIdx.delete(outId);
      this.playerToIdx.set(newPlayer.id, index);

      this.playerFitness[index] = newPlayer.currentStamina || 3.0;
      inTacticalPlayer.entryMinute = 0;
      inTacticalPlayer.isSentOff = false;
      inTacticalPlayer.yellowCards = 0;
      inTacticalPlayer.teamName = this.name;
      // Inherit the position key from the player being substituted out — 'SUB'
      // in subMap is a placeholder; the real position is determined by the
      // swap instruction's newPosition (which is the out-player's position).
      inTacticalPlayer.positionKey = outPlayer.positionKey;
      this.players[index] = inTacticalPlayer;

      // 预缓存新球员的贡献值
      AttributeCalculator.preCachePlayerContributions(
        newPlayer,
        inTacticalPlayer.positionKey,
      );
    }
  }

  /**
   * Moves a player to a new position.
   */
  movePlayer(playerId: number, newPosition: string) {
    const p = this.players.find((p) => (p.player as Player).id === playerId);
    if (p && !p.isSentOff) {
      p.positionKey = newPosition;
      // 重新缓存新位置的所有贡献值
      AttributeCalculator.preCachePlayerContributions(
        p.player as Player,
        newPosition,
      );
    }
  }

  /**
   * Checks if a position is currently occupied.
   */
  isPositionOccupied(positionKey: string): boolean {
    return this.players.some(
      (p) => p.positionKey === positionKey && !p.isSentOff,
    );
  }

  calculateLaneStrength(lane: Lane, phase: Phase): number {
    if (this.snapshot) {
      return parseFloat(this.snapshot.laneStrengths[lane][phase].toFixed(2));
    }
    return 0;
  }

  getGoalkeeper(): TacticalPlayer | undefined {
    return this.players.find((p) => p.positionKey === 'GK');
  }

  getSnapshot(): TeamSnapshot | null {
    return this.snapshot;
  }

  /**
   * Get average freeKicks skill of the team (excluding sent off players)
   */
  getAvgFreeKicks(): number {
    const players = this.players.filter(
      (p) => !p.isSentOff && !p.positionKey.includes('GK'),
    );
    if (players.length === 0) return 10;

    let total = 0;
    let count = 0;
    for (const p of players) {
      const player = p.player as Player;
      const freeKicks = player.attributes.freeKicks ?? 10;
      total += freeKicks;
      count++;
    }
    return count > 0 ? total / count : 10;
  }

  /**
   * Get average penalties skill of the team (excluding sent off players)
   */
  getAvgPenalties(): number {
    const players = this.players.filter(
      (p) => !p.isSentOff && !p.positionKey.includes('GK'),
    );
    if (players.length === 0) return 10;

    let total = 0;
    let count = 0;
    for (const p of players) {
      const player = p.player as Player;
      const penalties = player.attributes.penalties ?? 10;
      total += penalties;
      count++;
    }
    return count > 0 ? total / count : 10;
  }

  /**
   * Get the best set-piece taker for a specific type
   */
  getBestSetPieceTaker(
    type: 'corner' | 'free_kick' | 'penalty',
  ): TacticalPlayer | undefined {
    const candidates = this.players.filter(
      (p) => !p.isSentOff && !p.positionKey.includes('GK'),
    );
    if (candidates.length === 0) return undefined;

    let bestPlayer = candidates[0];
    let bestScore = -Infinity;

    for (const p of candidates) {
      const player = p.player as Player;

      let score = 0;
      if (type === 'penalty') {
        score = (player.attributes.penalties ?? 10) * 2;
      } else {
        score = (player.attributes.freeKicks ?? 10) * 2;
      }

      // AM/CM position bonus
      if (p.positionKey.includes('AM') || p.positionKey.includes('CM')) {
        score *= 1.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPlayer = p;
      }
    }

    return bestPlayer;
  }

  /**
   * Goalkeeper's set-piece defense rating.
   *
   * Returns 0-20 (the same magnitude as the `freeKicks`
   * attribute). This is the rating the corner / indirect
   * FK / direct FK / penalty formulas multiply by 0.2 to
   * build the defender sum — see `match.engine.ts:resolveCorner`
   * and the set-piece callsites for the formula.
   *
   * The historical implementation used `(... ) / 9`, which
   * put the rating in the 1-22 range and made the GK look
   * arbitrarily weaker on set pieces than the engine-side
   * `getSnapshot().gkRating` would suggest. The /10 divisor
   * here gives a clean 0-20 range — the design intent of
   * 'GK is a 20% factor on set pieces' is now visible in
   * the math (max-skill GK contributes `20 × 0.2 = 4`
   * against the attacker's free-kick sum which lands at
   * ~12 at max skill).
   */
  getGoalkeeperSetPieceRating(): number {
    const gk = this.getGoalkeeper();
    if (!gk) return 10;

    const player = gk.player as Player;
    return gkSetPieceRating(player.attributes);
  }
}
