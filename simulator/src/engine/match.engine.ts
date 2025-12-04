import { MatchEntity, MatchTacticsEntity, MatchType } from '@goalxi/database';
import { MatchState } from './match-state';
import { EventGenerator } from './event.generator';
import { MatchEventType } from './types';
import { DurationCalculator } from './duration.calculator';

export class MatchEngine {
    private state: MatchState;
    private eventGenerator: EventGenerator;
    private homeTactics: MatchTacticsEntity;
    private awayTactics: MatchTacticsEntity;
    private match: MatchEntity;

    constructor(
        match: MatchEntity,
        homeTactics: MatchTacticsEntity,
        awayTactics: MatchTacticsEntity,
    ) {
        this.match = match;
        this.state = new MatchState(match.id);
        this.state.setTeamIds(match.homeTeamId, match.awayTeamId);
        this.homeTactics = homeTactics;
        this.awayTactics = awayTactics;
        this.eventGenerator = new EventGenerator();
    }

    public simulateMatch(): MatchState {
        // Calculate match duration
        const duration = DurationCalculator.calculateMatchDuration(
            this.match.type as MatchType,
            false // Will check for draw later if tournament
        );

        // Kickoff
        this.state.addEvent({
            type: MatchEventType.KICKOFF,
            typeName: 'KICKOFF',
            minute: 0,
            second: 0,
            teamId: this.coinToss(),
        });

        this.state.setPossession(this.coinToss());
        this.state.isBallInPlay = true;

        // First Half (45 min + injury time)
        const firstHalfEnd = duration.firstHalfMinutes + duration.firstHalfInjuryTime;
        this.simulateHalf(0, firstHalfEnd);

        // Half Time
        this.state.addEvent({
            type: MatchEventType.HALF_TIME,
            typeName: 'HALF_TIME',
            minute: firstHalfEnd,
            second: 0,
        });
        this.state.isBallInPlay = false;

        // Second Half (starts after half-time break)
        const secondHalfStart = firstHalfEnd + duration.halfTimeBreak;
        const secondHalfEnd = secondHalfStart + duration.secondHalfMinutes + duration.secondHalfInjuryTime;
        this.simulateHalf(secondHalfStart, secondHalfEnd);

        // Check for extra time (tournament only)
        if (duration.hasExtraTime && this.state.homeScore === this.state.awayScore) {
            const extraTimeStart = secondHalfEnd + 15; // 15 min break
            const extraTimeFirstHalfEnd = extraTimeStart + duration.extraTimeFirstHalf!;
            this.simulateHalf(extraTimeStart, extraTimeFirstHalfEnd);

            const extraTimeSecondHalfStart = extraTimeFirstHalfEnd + duration.extraTimeBreak!;
            const extraTimeSecondHalfEnd = extraTimeSecondHalfStart + duration.extraTimeSecondHalf!;
            this.simulateHalf(extraTimeSecondHalfStart, extraTimeSecondHalfEnd);

            // Save extra time info to match
            this.match.hasExtraTime = true;
        }

        // Full Time
        this.state.addEvent({
            type: MatchEventType.FULL_TIME,
            typeName: 'FULL_TIME',
            minute: this.state.currentTime,
            second: 0,
        });

        // Save injury time to match
        this.match.firstHalfInjuryTime = duration.firstHalfInjuryTime;
        this.match.secondHalfInjuryTime = duration.secondHalfInjuryTime;

        return this.state;
    }

    private simulateHalf(startMinute: number, endMinute: number) {
        const tickDuration = 10; // 10 seconds per tick
        const startSecond = startMinute * 60;
        const endSecond = endMinute * 60;

        for (let t = startSecond; t < endSecond; t += tickDuration) {
            this.tick(tickDuration);
        }
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

                // Handle state changes based on event type
                if (event.type === MatchEventType.GOAL) {
                    const isHomeGoal = event.teamId === (this.state as any).homeTeamId;
                    this.state.addGoal(isHomeGoal);

                    // Reset to kickoff
                    this.state.setBallZone('Midfield');
                    this.state.setPossession(
                        isHomeGoal
                            ? (this.state as any).awayTeamId
                            : (this.state as any).homeTeamId
                    );
                }
            }
        }
    }

    private coinToss(): string {
        return Math.random() > 0.5
            ? (this.state as any).homeTeamId
            : (this.state as any).awayTeamId;
    }
}
