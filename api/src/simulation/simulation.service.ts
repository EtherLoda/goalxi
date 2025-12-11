import { Injectable } from '@nestjs/common';
import { MatchEngine, MatchEvent } from '../api/match/engine/match.engine';
import { Team } from '../api/match/engine/classes/Team';
import { PlayerAdapter } from './utils/player-adapter';
import { PlayerEntity } from '@goalxi/database';
import { TacticalPlayer } from '../api/match/engine/types/simulation.types';

@Injectable()
export class SimulationService {

    simulateMatch(homeTeamName: string, homePlayers: { entity: PlayerEntity, positionKey: string }[],
        awayTeamName: string, awayPlayers: { entity: PlayerEntity, positionKey: string }[]): MatchEvent[] {

        const homeTacticalPlayers: TacticalPlayer[] = homePlayers.map(p => ({
            player: PlayerAdapter.toSimulationPlayer(p.entity),
            positionKey: p.positionKey
        }));

        const awayTacticalPlayers: TacticalPlayer[] = awayPlayers.map(p => ({
            player: PlayerAdapter.toSimulationPlayer(p.entity),
            positionKey: p.positionKey
        }));

        const homeTeam = new Team(homeTeamName, homeTacticalPlayers);
        const awayTeam = new Team(awayTeamName, awayTacticalPlayers);

        const engine = new MatchEngine(homeTeam, awayTeam);
        return engine.simulateMatch();
    }
}
