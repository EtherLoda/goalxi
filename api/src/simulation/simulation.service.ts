import { Injectable } from '@nestjs/common';
import { MatchEngine, MatchEvent } from '../api/match/engine/match.engine';
import { Team } from '../api/match/engine/classes/Team';
import { PlayerAdapter } from './utils/player-adapter';
import { PlayerEntity } from '@goalxi/database';
import { TacticalPlayer, TacticalInstruction } from '../api/match/engine/types/simulation.types';

@Injectable()
export class SimulationService {

    simulateMatch(
        homeTeamName: string,
        homePlayers: { entity: PlayerEntity, positionKey: string }[],
        awayTeamName: string,
        awayPlayers: { entity: PlayerEntity, positionKey: string }[],
        homeInstructions: TacticalInstruction[] = [],
        awayInstructions: TacticalInstruction[] = [],
        potentialSubs: PlayerEntity[] = []
    ): MatchEvent[] {

        const homeTacticalPlayers: TacticalPlayer[] = homePlayers.map(p => ({
            player: PlayerAdapter.toSimulationPlayer(p.entity),
            positionKey: p.positionKey
        }));

        const awayTacticalPlayers: TacticalPlayer[] = awayPlayers.map(p => ({
            player: PlayerAdapter.toSimulationPlayer(p.entity),
            positionKey: p.positionKey
        }));

        const subMap = new Map<string, TacticalPlayer>();
        for (const entity of potentialSubs) {
            subMap.set(entity.id, {
                player: PlayerAdapter.toSimulationPlayer(entity),
                positionKey: 'SUB' // Temporary, will be set during swap
            });
        }

        const homeTeam = new Team(homeTeamName, homeTacticalPlayers);
        const awayTeam = new Team(awayTeamName, awayTacticalPlayers);

        const engine = new MatchEngine(
            homeTeam,
            awayTeam,
            homeInstructions,
            awayInstructions,
            subMap
        );

        return engine.simulateMatch();
    }
}

