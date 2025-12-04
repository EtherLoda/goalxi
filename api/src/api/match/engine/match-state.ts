import { MatchState as IMatchState, TeamMatchStats, Zone, MatchEventType } from './types';

export class MatchState implements IMatchState {
    matchId: string;
    currentTime: number = 0;
    currentSecond: number = 0;
    homeScore: number = 0;
    awayScore: number = 0;
    possessionTeamId: string | null = null;
    ballZone: Zone = 'Midfield';
    isBallInPlay: boolean = false;
    events: any[] = [];
    stats: {
        home: TeamMatchStats;
        away: TeamMatchStats;
    };

    constructor(matchId: string) {
        this.matchId = matchId;
        this.stats = {
            home: this.createEmptyStats(),
            away: this.createEmptyStats(),
        };
    }

    private createEmptyStats(): TeamMatchStats {
        return {
            possessionTime: 0,
            shots: 0,
            shotsOnTarget: 0,
            passes: 0,
            passesCompleted: 0,
            tackles: 0,
            fouls: 0,
            corners: 0,
            offsides: 0,
            yellowCards: 0,
            redCards: 0,
        };
    }

    advanceTime(seconds: number) {
        this.currentSecond += seconds;
        while (this.currentSecond >= 60) {
            this.currentSecond -= 60;
            this.currentTime++;
        }

        // Update possession time if ball is in play and possession is held
        if (this.isBallInPlay && this.possessionTeamId) {
            // Logic to attribute possession time could go here
            // For now, we'll just track it in the engine loop or assume even split per tick
        }
    }

    setPossession(teamId: string) {
        this.possessionTeamId = teamId;
    }

    setBallZone(zone: Zone) {
        this.ballZone = zone;
    }

    addEvent(event: any) {
        this.events.push(event);

        // Update score if goal
        if (event.type === MatchEventType.GOAL) {
            if (event.teamId === this.possessionTeamId) { // Assuming possession team scored
                // We need to know which team is home/away to update score correctly
                // This might require passing homeTeamId/awayTeamId to the state or checking event.teamId
            }
        }
    }

    updateStat(teamId: string, stat: keyof TeamMatchStats, value: number = 1) {
        // We need to know if teamId is home or away. 
        // Ideally MatchState should know the home/away team IDs.
        // For now, we'll assume the caller handles this or we add homeTeamId/awayTeamId to the class.
    }

    // Helper to set team IDs
    setTeamIds(homeTeamId: string, awayTeamId: string) {
        // We can store these to help with stat updates
        (this as any).homeTeamId = homeTeamId;
        (this as any).awayTeamId = awayTeamId;
    }

    incrementStat(isHomeTeam: boolean, stat: keyof TeamMatchStats, value: number = 1) {
        if (isHomeTeam) {
            this.stats.home[stat] += value;
        } else {
            this.stats.away[stat] += value;
        }
    }

    addGoal(isHomeTeam: boolean) {
        if (isHomeTeam) {
            this.homeScore++;
        } else {
            this.awayScore++;
        }
    }
}
