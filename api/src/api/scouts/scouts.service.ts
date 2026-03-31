import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import {
    ScoutCandidateEntity,
    ScoutCandidatePlayerData,
    YouthPlayerEntity,
    TeamEntity,
    PlayerEntity,
} from '@goalxi/database';
import { PotentialTier, PlayerAbility } from '@goalxi/database';
import { getRandomNameByNationality, getRandomNationality } from '../../constants/name-database';

const ALL_ABILITIES: PlayerAbility[] = ['header_specialist', 'long_passer', 'cross_specialist'];

const OUTFIELD_KEYS = ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];
const GK_KEYS = ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties'];

const POTENTIAL_TIER_THRESHOLDS: Array<{ tier: PotentialTier; min: number }> = [
    { tier: PotentialTier.LEGEND, min: 91 },
    { tier: PotentialTier.ELITE, min: 81 },
    { tier: PotentialTier.HIGH_PRO, min: 71 },
    { tier: PotentialTier.REGULAR, min: 56 },
    { tier: PotentialTier.LOW, min: 0 },
];

function randomBirthdayForAge(age: number): Date {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
    const offset = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
    return new Date(yearAgo.getTime() - offset);
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generatePlayerData(): Omit<ScoutCandidatePlayerData, 'revealedSkills' | 'joinedAt' | 'potentialRevealed' | 'potentialTier'> & { potentialTier: PotentialTier } {
    const isGoalkeeper = Math.random() < 0.1;
    const nationality = getRandomNationality();
    const { firstName, lastName } = getRandomNameByNationality(nationality);
    const age = 15 + Math.floor(Math.random() * 2); // 15 or 16
    const birthday = randomBirthdayForAge(age);

    // Generate potential ability (40-90 range)
    const potentialAbility = Math.floor(Math.random() * 51) + 40;

    // Determine tier
    let potentialTier = PotentialTier.LOW;
    for (const t of POTENTIAL_TIER_THRESHOLDS) {
        if (potentialAbility >= t.min) {
            potentialTier = t.tier;
            break;
        }
    }

    // Generate skills based on potentialAbility (target avg = potentialAbility/5, range 1-20)
    const targetAvg = potentialAbility / 5;
    const keys = isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
    const potential: Record<string, number> = {};
    const current: Record<string, number> = {};

    keys.forEach(k => {
        const potVal = Math.max(1, Math.min(20, targetAvg + (Math.random() * 6 - 3)));
        potential[k] = parseFloat(potVal.toFixed(2));
        // Current for age 15-16: ~40% of potential
        const curVal = Math.max(1, Math.min(potential[k], potential[k] * (0.35 + Math.random() * 0.1)));
        current[k] = parseFloat(curVal.toFixed(2));
    });

    // 30% chance of having an ability
    const abilities = Math.random() < 0.30 ? [pickRandom(ALL_ABILITIES)] : undefined;

    return {
        name: `${firstName} ${lastName}`,
        birthday,
        nationality,
        isGoalkeeper,
        currentSkills: {
            physical: { pace: current['pace'], strength: current['strength'] },
            technical: isGoalkeeper
                ? { reflexes: current['reflexes'], handling: current['handling'], distribution: current['distribution'] }
                : { finishing: current['finishing'], passing: current['passing'], dribbling: current['dribbling'], defending: current['defending'] },
            mental: { positioning: current['positioning'], composure: current['composure'] },
            setPieces: { freeKicks: current['freeKicks'], penalties: current['penalties'] },
        } as any,
        potentialSkills: {
            physical: { pace: potential['pace'], strength: potential['strength'] },
            technical: isGoalkeeper
                ? { reflexes: potential['reflexes'], handling: potential['handling'], distribution: potential['distribution'] }
                : { finishing: potential['finishing'], passing: potential['passing'], dribbling: potential['dribbling'], defending: potential['defending'] },
            mental: { positioning: potential['positioning'], composure: potential['composure'] },
            setPieces: { freeKicks: potential['freeKicks'], penalties: potential['penalties'] },
        } as any,
        abilities,
        potentialTier,
    };
}

function pickRevealedSkills(keys: string[]): string[] {
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
}

function buildRevealedSkills(playerData: ReturnType<typeof generatePlayerData>): string[] {
    const keys = playerData.isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
    const revealed: string[] = [];
    // 2 current skills
    const currentKeys = pickRevealedSkills(keys);
    revealed.push(...currentKeys);
    // 2 potential skills (different from current if possible)
    const remaining = keys.filter(k => !revealed.includes(k));
    revealed.push(...pickRevealedSkills(remaining.length > 0 ? remaining : keys));
    return revealed;
}

@Injectable()
export class ScoutsService {
    constructor(
        @InjectRepository(ScoutCandidateEntity)
        private candidateRepo: Repository<ScoutCandidateEntity>,
        @InjectRepository(YouthPlayerEntity)
        private youthPlayerRepo: Repository<YouthPlayerEntity>,
        @InjectRepository(PlayerEntity)
        private playerRepo: Repository<PlayerEntity>,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
    ) {}

    /** Generate 3 scout candidates for a team */
    async generateThreeCandidates(teamId: string): Promise<ScoutCandidateEntity[]> {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const candidates: ScoutCandidateEntity[] = [];
        for (let i = 0; i < 3; i++) {
            const playerData = generatePlayerData();
            const revealed = buildRevealedSkills(playerData);
            const potentialRevealed = Math.random() < 0.30; // 30% chance

            const candidate = this.candidateRepo.create({
                teamId,
                playerData: {
                    ...playerData,
                    revealedSkills: revealed,
                    potentialRevealed,
                    potentialTier: potentialRevealed ? playerData.potentialTier : undefined,
                    joinedAt: new Date(),
                } as ScoutCandidatePlayerData,
                expiresAt,
            });
            candidates.push(await this.candidateRepo.save(candidate));
        }
        return candidates;
    }

    /** Get all active candidates for a team */
    async getCandidates(teamId: string): Promise<ScoutCandidateEntity[]> {
        return this.candidateRepo.find({
            where: { teamId, expiresAt: MoreThanOrEqual(new Date()) },
            order: { createdAt: 'DESC' },
        });
    }

    /** Select a candidate → convert to YouthPlayerEntity */
    async selectCandidate(candidateId: string): Promise<YouthPlayerEntity> {
        const candidate = await this.candidateRepo.findOneByOrFail({ id: candidateId });
        const { playerData } = candidate;

        const youth = this.youthPlayerRepo.create({
            teamId: candidate.teamId,
            name: playerData.name,
            birthday: playerData.birthday,
            isGoalkeeper: playerData.isGoalkeeper,
            currentSkills: playerData.currentSkills,
            potentialSkills: playerData.potentialSkills,
            abilities: playerData.abilities,
            revealLevel: 1,
            revealedSkills: playerData.revealedSkills,
            potentialRevealed: playerData.potentialRevealed,
            potentialTier: playerData.potentialTier,
            isPromoted: false,
            joinedAt: new Date(),
        });

        await this.youthPlayerRepo.save(youth);
        await this.candidateRepo.delete({ id: candidateId });
        return youth;
    }

    /** Skip a candidate → delete it */
    async skipCandidate(candidateId: string): Promise<void> {
        await this.candidateRepo.delete({ id: candidateId });
    }

    /** Clean up expired candidates */
    async cleanupExpired(): Promise<number> {
        const result = await this.candidateRepo.delete({ expiresAt: LessThan(new Date()) });
        return result.affected ?? 0;
    }
}
