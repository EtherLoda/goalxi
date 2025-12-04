import { MatchEntity, MatchTacticsEntity } from '@goalxi/database';
import { MatchState } from './match-state';
import { EventGenerator } from './event.generator';
import { MatchEventType } from './types';

export class MatchEngine {
    private state: MatchState;
    private eventGenerator: EventGenerator;
    private homeTactics: MatchTacticsEntity;
    private awayTactics: MatchTacticsEntity;

    constructor(
        match: MatchEntity,
        homeTactics: MatchTacticsEntity,
        awayTactics: MatchTacticsEntity,
    ) {
        this.state = new MatchState(match.id);
        this.state.setTeamIds(match.homeTeamId, match.awayTeamId);
        this.homeTactics = homeTactics;
        this.awayTactics = awayTactics;
        this.eventGenerator = new EventGenerator();
    }

    public simulateMatch(): MatchState {
        // Start match
        this.state.addEvent({
            type: MatchEventType.KICKOFF,
            minute: 0,
            second: 0,
            teamId: this.state.matchId, // Or coin toss winner
        });

        // Coin toss (random for now)
        this.state.setPossession(Math.random() > 0.5 ? (this.state as any).homeTeamId : (this.state as any).awayTeamId);
        this.state.isBallInPlay = true;

        // Simulation Loop (90 minutes)
        // We simulate second by second or tick by tick
        const totalSeconds = 90 * 60;
        const tickDuration = 10; // 10 seconds per tick for speed

        for (let t = 0; t < totalSeconds; t += tickDuration) {
            this.tick(tickDuration);

            // Half time check
            if (this.state.currentTime === 45 && this.state.currentSecond === 0) {
                this.state.addEvent({
                    type: MatchEventType.HALF_TIME,
                    minute: 45,
                    second: 0,
                });
                this.state.isBallInPlay = false;
                // Resume logic needed here (switch sides, kickoff)
                this.state.isBallInPlay = true; // Auto resume for now
            }
        }

        // Full time
        this.state.addEvent({
            type: MatchEventType.FULL_TIME,
            minute: 90,
            second: 0,
        });

        return this.state;
    }

    private tick(seconds: number) {
        this.state.advanceTime(seconds);

        if (this.state.isBallInPlay) {
            const event = this.eventGenerator.generateEvent(
                this.state,
                this.homeTactics,
                this.awayTactics
            );

            if (event) {
                this.state.addEvent(event);
                // Handle state changes based on event type if needed
                // e.g., Goal -> Reset to Kickoff
                if (event.type === MatchEventType.GOAL) {
                    this.state.addGoal(event.teamId === (this.state as any).homeTeamId);
                    this.state.isBallInPlay = false;
                    // Reset to center, change possession to conceding team
                    this.state.setBallZone('Midfield');
                    this.state.setPossession(
                        event.teamId === (this.state as any).homeTeamId
                            ? (this.state as any).awayTeamId
                            : (this.state as any).homeTeamId
                    );
                    this.state.isBallInPlay = true; // Resume
                }
            }
        }
    }
}
