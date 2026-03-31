import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual } from 'typeorm';
import {
    YouthPlayerEntity,
    TeamEntity,
    ScoutCandidateEntity,
    PlayerAbility,
} from '@goalxi/database';

@Injectable()
export class ScoutSchedulerService {
    private readonly logger = new Logger(ScoutSchedulerService.name);

    constructor(
        @InjectRepository(YouthPlayerEntity)
        private youthPlayerRepo: Repository<YouthPlayerEntity>,
        @InjectRepository(TeamEntity)
        private teamRepo: Repository<TeamEntity>,
        @InjectRepository(ScoutCandidateEntity)
        private scoutCandidateRepo: Repository<ScoutCandidateEntity>,
    ) {}

    // ===== 每周期开始：生成新的球探候选球员 =====
    @Cron('0 0 0 * * 6') // 每周六 00:00
    async generateScoutCandidates() {
        this.logger.debug('[ScoutScheduler] Generating scout candidates for all teams');

        // 先清理已过期的候选人
        await this.scoutCandidateRepo.delete({ expiresAt: LessThan(new Date()) });

        const teams = await this.teamRepo.find();
        for (const team of teams) {
            try {
                // 检查本周是否已有候选人（防止重复生成）
                const existing = await this.scoutCandidateRepo.find({
                    where: { teamId: team.id, expiresAt: LessThanOrEqual(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) },
                });
                if (existing.length > 0) {
                    this.logger.debug(`[ScoutScheduler] Team ${team.id} already has candidates, skipping`);
                    continue;
                }

                for (let i = 0; i < 3; i++) {
                    const candidate = this.createScoutCandidate(team.id);
                    await this.scoutCandidateRepo.save(candidate);
                }
                this.logger.debug(`[ScoutScheduler] Generated 3 candidates for team ${team.id}`);
            } catch (error) {
                this.logger.error(`[ScoutScheduler] Failed for team ${team.id}: ${error.message}`);
            }
        }
    }

    // ===== 每周六：青训球员成长 + 技能揭露 =====
    @Cron('0 0 0 * * 6') // 每周六 00:00
    async growAndRevealYouthPlayers() {
        this.logger.debug('[YouthScheduler] Processing youth player growth and reveal');

        const youthPlayers = await this.youthPlayerRepo.find({ where: { isPromoted: false } });

        for (const youth of youthPlayers) {
            try {
                this.applyYouthGrowth(youth);
                this.revealNextSkills(youth);
                youth.revealLevel++;
                await this.youthPlayerRepo.save(youth);
            } catch (error) {
                this.logger.error(`[YouthScheduler] Failed for youth ${youth.id}: ${error.message}`);
            }
        }

        this.logger.debug(`[YouthScheduler] Processed ${youthPlayers.length} youth players`);
    }

    private applyYouthGrowth(youth: YouthPlayerEntity): void {
        const keys = youth.isGoalkeeper
            ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
            : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

        for (const cat of Object.values(youth.currentSkills)) {
            if (cat && typeof cat === 'object') {
                for (const key of Object.keys(cat as object)) {
                    if (keys.includes(key)) {
                        const current = (cat as any)[key] as number;
                        let potential = current;
                        for (const pCat of Object.values(youth.potentialSkills)) {
                            if (pCat && (pCat as any)[key] !== undefined) {
                                potential = (pCat as any)[key];
                                break;
                            }
                        }
                        const growth = Math.random() * 0.1;
                        const newVal = Math.min(potential, current + growth);
                        (cat as any)[key] = parseFloat(newVal.toFixed(2));
                    }
                }
            }
        }
    }

    private revealNextSkills(youth: YouthPlayerEntity): void {
        const keys = youth.isGoalkeeper
            ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
            : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

        const remaining = keys.filter(k => !youth.revealedSkills.includes(k));
        if (remaining.length === 0) return;

        const count = Math.min(remaining.length, Math.random() < 0.5 ? 1 : 2);
        const toReveal = remaining.sort(() => Math.random() - 0.5).slice(0, count);
        youth.revealedSkills = [...youth.revealedSkills, ...toReveal];
    }

    private createScoutCandidate(teamId: string): ScoutCandidateEntity {
        const isGoalkeeper = Math.random() < 0.1;
        const nationality = this.getRandomNationality();
        const { firstName, lastName } = this.getRandomNameByNationality(nationality);
        const age = 15 + Math.floor(Math.random() * 2);
        const birthday = this.randomBirthdayForAge(age);

        const potentialAbility = Math.floor(Math.random() * 51) + 40;
        const targetAvg = potentialAbility / 5;

        const keys = isGoalkeeper
            ? ['pace', 'strength', 'reflexes', 'handling', 'distribution', 'positioning', 'composure', 'freeKicks', 'penalties']
            : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];

        const potential: Record<string, number> = {};
        const current: Record<string, number> = {};

        keys.forEach(k => {
            const potVal = Math.max(1, Math.min(20, targetAvg + (Math.random() * 6 - 3)));
            potential[k] = parseFloat(potVal.toFixed(2));
            const curVal = Math.max(1, Math.min(potential[k], potential[k] * (0.35 + Math.random() * 0.1)));
            current[k] = parseFloat(curVal.toFixed(2));
        });

        const abilities = Math.random() < 0.30
            ? [this.pickRandom(['header_specialist', 'long_passer', 'cross_specialist']) as PlayerAbility]
            : undefined;

        let potentialTier = 'LOW';
        if (potentialAbility >= 91) potentialTier = 'LEGEND';
        else if (potentialAbility >= 81) potentialTier = 'ELITE';
        else if (potentialAbility >= 71) potentialTier = 'HIGH_PRO';
        else if (potentialAbility >= 56) potentialTier = 'REGULAR';

        const potentialRevealed = Math.random() < 0.30;

        const shuffled = [...keys].sort(() => Math.random() - 0.5);
        const currentRevealed = shuffled.slice(0, 2);
        const remainingPotential = keys.filter(k => !currentRevealed.includes(k));
        const potentialRevealed2 = remainingPotential.length > 0
            ? remainingPotential.sort(() => Math.random() - 0.5).slice(0, 2)
            : shuffled.slice(2, 4);
        const revealedSkills = [...currentRevealed, ...potentialRevealed2];

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const playerData = {
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
            },
            potentialSkills: {
                physical: { pace: potential['pace'], strength: potential['strength'] },
                technical: isGoalkeeper
                    ? { reflexes: potential['reflexes'], handling: potential['handling'], distribution: potential['distribution'] }
                    : { finishing: potential['finishing'], passing: potential['passing'], dribbling: potential['dribbling'], defending: potential['defending'] },
                mental: { positioning: potential['positioning'], composure: potential['composure'] },
                setPieces: { freeKicks: potential['freeKicks'], penalties: potential['penalties'] },
            },
            abilities,
            potentialTier: potentialTier as any,
            potentialRevealed,
            revealedSkills,
            joinedAt: new Date(),
        };

        return this.scoutCandidateRepo.create({ teamId, playerData, expiresAt });
    }

    private randomBirthdayForAge(age: number): Date {
        const now = new Date();
        const yearAgo = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
        const offset = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
        return new Date(yearAgo.getTime() - offset);
    }

    private getRandomNationality(): string {
        const n = ['CN', 'GB', 'ES', 'BR', 'IT', 'FR', 'DE', 'NL', 'AR', 'PT', 'US', 'NG', 'SN', 'JP', 'KR', 'MX'];
        return n[Math.floor(Math.random() * n.length)];
    }

    private getRandomNameByNationality(nationality: string): { firstName: string; lastName: string } {
        const firstNames: Record<string, string[]> = {
            CN: ['Wei', 'Ming', 'Hui', 'Jie', 'Lin', 'Feng', 'Yu', 'Qiang'],
            GB: ['James', 'Oliver', 'Harry', 'Jack', 'George', 'William', 'Thomas', 'Charlie'],
            ES: ['Pablo', 'Carlos', 'Miguel', 'Alejandro', 'Daniel', 'David', 'Javier', 'Sergio'],
            BR: ['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Bruno', 'Rafael', 'Felipe', 'Gustavo'],
            IT: ['Luca', 'Marco', 'Alessandro', 'Andrea', 'Matteo', 'Lorenzo', 'Francesco', 'Davide'],
            FR: ['Lucas', 'Hugo', 'Gabriel', 'Arthur', 'Raphael', 'Louis', 'Paul', 'Jules'],
            DE: ['Leon', 'Felix', 'Luca', 'Jonas', 'Finn', 'Elias', 'Benjamin', 'Max'],
            NL: ['Daan', 'Teun', 'Sem', 'Luuk', 'Bram', 'Max', 'Milan', 'Ruben'],
            AR: ['Santiago', 'Mateo', 'Tomas', 'Franco', 'Joaquin', 'Santino', 'Lautaro', 'Thiago'],
            PT: ['Francisco', 'Goncalo', 'Tomas', 'Afonso', 'Joao', 'Pedro', 'Diogo', 'Bruno'],
            US: ['James', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles'],
            NG: ['Chidi', 'Emeka', 'Obinna', 'Kelechi', 'Ifeanyi', 'Uchenna', 'Chukwuemeka', 'Nnamdi'],
            SN: ['Moussa', 'Mamadou', 'Ismaila', 'Sadio', 'Baba', 'Cheikh', 'Moustapha', 'Kalidou'],
            JP: ['Haruki', 'Haruto', 'Yuto', 'Sota', 'Riku', 'Kaito', 'Hayato', 'Soshi'],
            KR: ['Jin', 'Min', 'Hyeok', 'Seo', 'Jun', 'Hyun', 'Dae', 'Woo'],
            MX: ['Diego', 'Luis', 'Carlos', 'Jose', 'Fernando', 'Adrian', 'Eduardo', 'Javier'],
        };
        const lastNames: Record<string, string[]> = {
            CN: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao'],
            GB: ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Thomas'],
            ES: ['Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Hernandez', 'Perez', 'Sanchez'],
            BR: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira'],
            IT: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Costa'],
            FR: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand'],
            DE: ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker'],
            NL: ['Jansen', 'de Vries', 'van der Meer', 'Bakker', 'Visser', 'Koning', 'de Jong', 'Dekker'],
            AR: ['Garcia', 'Lopez', 'Martinez', 'Rodriguez', 'Gomez', 'Fernandez', 'Alvarez', 'Ruiz'],
            PT: ['Silva', 'Santos', 'Oliveira', 'Sousa', 'Lima', 'Pereira', 'Almeida', 'Ferreira'],
            US: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'],
            NG: ['Okonkwo', 'Adeyemi', 'Obi', 'Nnamdi', 'Eze', 'Ogundimu', 'Ayodele', 'Umar'],
            SN: ['Diallo', 'Sarr', 'Faye', 'Diop', 'Cisse', 'Sow', 'Ba', 'Ndiaye'],
            JP: ['Yamamoto', 'Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Nakamura'],
            KR: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Jang'],
            MX: ['Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Hernandez', 'Perez', 'Ramirez'],
        };
        const first = firstNames[nationality] ?? ['Xin', 'Ming'];
        const last = lastNames[nationality] ?? ['Li', 'Wang'];
        return {
            firstName: first[Math.floor(Math.random() * first.length)],
            lastName: last[Math.floor(Math.random() * last.length)],
        };
    }

    private pickRandom<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }
}
