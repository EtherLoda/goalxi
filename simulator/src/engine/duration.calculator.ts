import { MatchType, GAME_SETTINGS } from '@goalxi/database';

export interface MatchDuration {
    firstHalfMinutes: number;
    firstHalfInjuryTime: number;
    halfTimeBreak: number;
    secondHalfMinutes: number;
    secondHalfInjuryTime: number;

    // Tournament only
    hasExtraTime?: boolean;
    extraTimeFirstHalf?: number;
    extraTimeBreak?: number;
    extraTimeSecondHalf?: number;
}

export class DurationCalculator {
    /**
     * Calculate match duration based on match type and whether it's tied
     */
    static calculateMatchDuration(
        matchType: MatchType,
        isDrawAfterRegularTime: boolean = false
    ): MatchDuration {
        const duration: MatchDuration = {
            firstHalfMinutes: GAME_SETTINGS.MATCH_FIRST_HALF_MINUTES,
            firstHalfInjuryTime: this.randomInjuryTime(
                GAME_SETTINGS.MATCH_INJURY_TIME_MIN,
                GAME_SETTINGS.MATCH_INJURY_TIME_MAX
            ),
            halfTimeBreak: GAME_SETTINGS.MATCH_HALF_TIME_MINUTES,
            secondHalfMinutes: GAME_SETTINGS.MATCH_SECOND_HALF_MINUTES,
            secondHalfInjuryTime: this.randomInjuryTime(
                GAME_SETTINGS.MATCH_INJURY_TIME_MIN,
                GAME_SETTINGS.MATCH_INJURY_TIME_MAX
            ),
        };

        // Tournament matches can have extra time if tied
        if (matchType === MatchType.TOURNAMENT && isDrawAfterRegularTime) {
            duration.hasExtraTime = true;
            duration.extraTimeFirstHalf = GAME_SETTINGS.MATCH_EXTRA_TIME_FIRST_HALF_MINUTES;
            duration.extraTimeBreak = GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES;
            duration.extraTimeSecondHalf = GAME_SETTINGS.MATCH_EXTRA_TIME_SECOND_HALF_MINUTES;
        } else {
            duration.hasExtraTime = false;
        }

        return duration;
    }

    /**
     * Generate random injury time within min/max range
     */
    private static randomInjuryTime(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Calculate total match minutes including injury time
     */
    static getTotalMinutes(duration: MatchDuration): number {
        let total = duration.firstHalfMinutes +
            duration.firstHalfInjuryTime +
            duration.secondHalfMinutes +
            duration.secondHalfInjuryTime;

        if (duration.hasExtraTime) {
            total += duration.extraTimeFirstHalf! + duration.extraTimeSecondHalf!;
        }

        return total;
    }

    /**
     * Get minute when second half starts (including half-time break)
     */
    static getSecondHalfStartMinute(duration: MatchDuration): number {
        return duration.firstHalfMinutes +
            duration.firstHalfInjuryTime +
            duration.halfTimeBreak;
    }

    /**
     * Get minute when extra time starts (if applicable)
     */
    static getExtraTimeStartMinute(duration: MatchDuration): number {
        return 90 + 15; // After regular time + break
    }
}
