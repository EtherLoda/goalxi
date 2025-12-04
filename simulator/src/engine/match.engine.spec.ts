import { MatchEngine } from './match.engine';
import { MatchEntity, MatchTacticsEntity } from '@goalxi/database';
import { MatchEventType } from './types';

describe('MatchEngine', () => {
    let engine: MatchEngine;
    let mockMatch: MatchEntity;
    let mockHomeTactics: MatchTacticsEntity;
    let mockAwayTactics: MatchTacticsEntity;

    beforeEach(() => {
        mockMatch = {
            id: 'match-id',
            homeTeamId: 'home-id',
            awayTeamId: 'away-id',
        } as MatchEntity;

        mockHomeTactics = {
            id: 'home-tactics-id',
            lineup: {},
        } as MatchTacticsEntity;

        mockAwayTactics = {
            id: 'away-tactics-id',
            lineup: {},
        } as MatchTacticsEntity;

        engine = new MatchEngine(mockMatch, mockHomeTactics, mockAwayTactics);
    });

    it('should initialize correctly', () => {
        const state = (engine as any).state;
        expect(state.matchId).toBe('match-id');
        expect(state.homeScore).toBe(0);
        expect(state.awayScore).toBe(0);
    });

    it('should simulate a full match', () => {
        const finalState = engine.simulateMatch();

        expect(finalState.currentTime).toBeGreaterThanOrEqual(90);
        expect(finalState.events.length).toBeGreaterThan(0);

        // Check for mandatory events
        const kickoff = finalState.events.find(e => e.type === MatchEventType.KICKOFF);
        const fullTime = finalState.events.find(e => e.type === MatchEventType.FULL_TIME);

        expect(kickoff).toBeDefined();
        expect(fullTime).toBeDefined();
    });

    it('should handle goals correctly', () => {
        // Mock event generator to force a goal
        const generator = (engine as any).eventGenerator;
        jest.spyOn(generator, 'generateEvent').mockReturnValueOnce({
            type: MatchEventType.GOAL,
            teamId: 'home-id',
            minute: 10,
            second: 0,
        });

        // Run a short simulation manually or just tick
        (engine as any).state.isBallInPlay = true;
        (engine as any).tick(60); // Advance 1 minute

        const state = (engine as any).state;
        expect(state.homeScore).toBe(1);
        expect(state.events.find((e: any) => e.type === MatchEventType.GOAL)).toBeDefined();
    });
});
