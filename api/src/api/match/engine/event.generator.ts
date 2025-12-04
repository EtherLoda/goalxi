import { MatchState } from './match-state';
import { MatchEventType, Zone } from './types';
import { MatchTacticsEntity } from '@goalxi/database';

export class EventGenerator {
    constructor() { }

    generateEvent(
        state: MatchState,
        homeTactics: MatchTacticsEntity,
        awayTactics: MatchTacticsEntity,
    ): any | null {
        // 1. Determine active team (possession)
        const possessionTeamId = state.possessionTeamId;
        if (!possessionTeamId) {
            // Kickoff or loose ball logic
            return null;
        }

        const isHomePossession = possessionTeamId === (state as any).homeTeamId;
        const attackingTeamTactics = isHomePossession ? homeTactics : awayTactics;
        const defendingTeamTactics = isHomePossession ? awayTactics : homeTactics;

        // 2. Calculate probabilities based on Zone
        // This is where the core logic will live.
        // For now, we'll implement a very simple random event generator

        const roll = Math.random();

        if (state.ballZone === 'Attack') {
            if (roll < 0.05) {
                return {
                    type: MatchEventType.GOAL,
                    teamId: possessionTeamId,
                    minute: state.currentTime,
                    second: state.currentSecond,
                };
            } else if (roll < 0.15) {
                return {
                    type: MatchEventType.SHOT_OFF_TARGET,
                    teamId: possessionTeamId,
                    minute: state.currentTime,
                    second: state.currentSecond,
                };
            }
        } else if (state.ballZone === 'Midfield') {
            if (roll < 0.2) {
                // Move to attack
                state.setBallZone('Attack');
                return {
                    type: MatchEventType.PASS, // Successful pass forward
                    teamId: possessionTeamId,
                    minute: state.currentTime,
                    second: state.currentSecond,
                };
            } else if (roll > 0.8) {
                // Lost possession
                state.setPossession(isHomePossession ? (state as any).awayTeamId : (state as any).homeTeamId);
                return {
                    type: MatchEventType.INTERCEPTION,
                    teamId: isHomePossession ? (state as any).awayTeamId : (state as any).homeTeamId,
                    minute: state.currentTime,
                    second: state.currentSecond,
                };
            }
        }

        return null;
    }
}
