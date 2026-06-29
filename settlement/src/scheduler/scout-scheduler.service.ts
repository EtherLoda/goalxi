import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual } from 'typeorm';
import {
  PlayerAbility,
  ScoutCandidateEntity,
  TeamEntity,
  YouthPlayerEntity,
  applyWeeklyGrowth,
  generateScoutCandidate,
  pickNextRevealSkills,
} from '@goalxi/database';

@Injectable()
export class ScoutSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(YouthPlayerEntity)
    private youthPlayerRepo: Repository<YouthPlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(ScoutCandidateEntity)
    private scoutCandidateRepo: Repository<ScoutCandidateEntity>,
  ) {}

  @Cron('0 0 6 * * 6') // 每周�?06:00
  async generateScoutCandidates() {
    this.logger.debug(
      '[ScoutScheduler] Generating scout candidates for all teams',
    );

    await this.scoutCandidateRepo.delete({ expiresAt: LessThan(new Date()) });

    const teams = await this.teamRepo.find();
    for (const team of teams) {
      try {
        const existing = await this.scoutCandidateRepo.find({
          where: {
            teamId: team.id,
            expiresAt: LessThanOrEqual(
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            ),
          },
        });
        if (existing.length > 0) {
          this.logger.debug(
            `[ScoutScheduler] Team ${team.id} already has candidates, skipping`,
          );
          continue;
        }

        for (let i = 0; i < 3; i++) {
          const candidate = this.createScoutCandidate(team.id);
          await this.scoutCandidateRepo.save(candidate);
        }
        this.logger.debug(
          `[ScoutScheduler] Generated 3 candidates for team ${team.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[ScoutScheduler] Failed for team ${team.id}: ${error.message}`,
        );
      }
    }
  }

  @Cron('0 0 0 * * 6') // 每周�?00:00
  async growAndRevealYouthPlayers() {
    this.logger.debug(
      '[YouthScheduler] Processing youth player growth and reveal',
    );

    const youthPlayers = await this.youthPlayerRepo.find({
      where: { isPromoted: false },
    });

    for (const youth of youthPlayers) {
      try {
        this.applyYouthGrowth(youth);
        this.revealNextSkills(youth);
        youth.revealLevel++;
        await this.youthPlayerRepo.save(youth);
      } catch (error) {
        this.logger.error(
          `[YouthScheduler] Failed for youth ${youth.id}: ${error.message}`,
        );
      }
    }

    this.logger.debug(
      `[YouthScheduler] Processed ${youthPlayers.length} youth players`,
    );
  }

  private applyYouthGrowth(youth: YouthPlayerEntity): void {
    // [D2] Delegates to the shared progression utility so behavior is
    // identical to the cron-driven path used by YouthService.
    applyWeeklyGrowth(youth);
  }

  private revealNextSkills(youth: YouthPlayerEntity): void {
    // [D3] Delegates to the shared reveal utility.
    youth.revealedSkills = pickNextRevealSkills({
      isGoalkeeper: youth.isGoalkeeper,
      revealedSkills: youth.revealedSkills,
    });
  }

  private createScoutCandidate(teamId: string): ScoutCandidateEntity {
    // [D1] Delegates to the shared scout-generator utility. The "uniform"
    // algorithm mirrors the original scheduler distribution: PA ∈ [40, 90],
    // per-skill = PA/5 ± 3, current skill = 35-45% of potential.
    const ABILITY_POOL: PlayerAbility[] = [
      'header_specialist',
      'long_passer',
      'cross_specialist',
    ];
    const PLAYER_DATA = generateScoutCandidate({
      tierDistribution: {
        // The scheduler doesn't compute PA-tier; pass uniform weights so the
        // generator uses its default LEGEND tier (which is fine — the field
        // is only used for UI, and PA is what actually drives balance here).
        LOW: 1,
      },
      algorithm: 'uniform',
      paRange: [40, 90],
      currentRatio: [0.35, 0.45],
      abilityPool: ABILITY_POOL,
      abilityChance: 0.3,
      revealedSkillCount: 4,
      outfieldPositions: [
        'ST',
        'CF',
        'LW',
        'RW',
        'AM',
        'CM',
        'DM',
        'LB',
        'RB',
        'CB',
      ],
      positionSkillImpact: {
        ST: { high: ['finishing', 'positioning', 'pace'], medium: ['strength', 'composure', 'dribbling'], low: ['passing', 'defending'] },
        CF: { high: ['finishing', 'positioning', 'strength'], medium: ['pace', 'composure', 'dribbling'], low: ['passing', 'defending'] },
        LW: { high: ['pace', 'dribbling', 'finishing'], medium: ['passing', 'strength'], low: ['defending', 'composure'] },
        RW: { high: ['pace', 'dribbling', 'finishing'], medium: ['passing', 'strength'], low: ['defending', 'composure'] },
        AM: { high: ['dribbling', 'passing', 'finishing'], medium: ['positioning', 'pace'], low: ['defending', 'strength', 'composure'] },
        CM: { high: ['passing', 'dribbling', 'positioning'], medium: ['composure', 'defending', 'strength'], low: ['finishing', 'pace'] },
        DM: { high: ['defending', 'positioning', 'passing'], medium: ['dribbling', 'composure', 'strength'], low: ['finishing', 'pace'] },
        LB: { high: ['defending', 'positioning', 'pace'], medium: ['strength', 'composure', 'passing'], low: ['finishing', 'dribbling'] },
        RB: { high: ['defending', 'positioning', 'pace'], medium: ['strength', 'composure', 'passing'], low: ['finishing', 'dribbling'] },
        CB: { high: ['defending', 'positioning', 'strength'], medium: ['pace', 'composure'], low: ['dribbling', 'passing', 'finishing'] },
        GK: { high: ['reflexes', 'handling'], medium: ['aerial', 'positioning', 'composure'], low: ['pace', 'strength'] },
      },
      goalkeeperChance: 0.1,
      ageRange: [15, 16],
      pickRandomNationality: () => this.getRandomNationality(),
      getRandomNameByNationality: (n) => this.getRandomNameByNationality(n),
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.scoutCandidateRepo.create({
      teamId,
      playerData: PLAYER_DATA,
      expiresAt,
    });
  }

  private randomBirthdayForAge(age: number): Date {
    const now = new Date();
    const yearAgo = new Date(
      now.getFullYear() - age,
      now.getMonth(),
      now.getDate(),
    );
    const offset = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
    return new Date(yearAgo.getTime() - offset);
  }

  private getRandomNationality(): string {
    const n = [
      'CN',
      'GB',
      'ES',
      'BR',
      'IT',
      'FR',
      'DE',
      'NL',
      'AR',
      'PT',
      'US',
      'NG',
      'SN',
      'JP',
      'KR',
      'MX',
    ];
    return n[Math.floor(Math.random() * n.length)];
  }

  private getRandomNameByNationality(nationality: string): {
    firstName: string;
    lastName: string;
  } {
    const firstNames: Record<string, string[]> = {
      CN: ['Wei', 'Ming', 'Hui', 'Jie', 'Lin', 'Feng', 'Yu', 'Qiang'],
      GB: [
        'James',
        'Oliver',
        'Harry',
        'Jack',
        'George',
        'William',
        'Thomas',
        'Charlie',
      ],
      ES: [
        'Pablo',
        'Carlos',
        'Miguel',
        'Alejandro',
        'Daniel',
        'David',
        'Javier',
        'Sergio',
      ],
      BR: [
        'Gabriel',
        'Lucas',
        'Matheus',
        'Pedro',
        'Bruno',
        'Rafael',
        'Felipe',
        'Gustavo',
      ],
      IT: [
        'Luca',
        'Marco',
        'Alessandro',
        'Andrea',
        'Matteo',
        'Lorenzo',
        'Francesco',
        'Davide',
      ],
      FR: [
        'Lucas',
        'Hugo',
        'Gabriel',
        'Arthur',
        'Raphael',
        'Louis',
        'Paul',
        'Jules',
      ],
      DE: [
        'Leon',
        'Felix',
        'Luca',
        'Jonas',
        'Finn',
        'Elias',
        'Benjamin',
        'Max',
      ],
      NL: ['Daan', 'Teun', 'Sem', 'Luuk', 'Bram', 'Max', 'Milan', 'Ruben'],
      AR: [
        'Santiago',
        'Mateo',
        'Tomas',
        'Franco',
        'Joaquin',
        'Santino',
        'Lautaro',
        'Thiago',
      ],
      PT: [
        'Francisco',
        'Goncalo',
        'Tomas',
        'Afonso',
        'Joao',
        'Pedro',
        'Diogo',
        'Bruno',
      ],
      US: [
        'James',
        'Michael',
        'William',
        'David',
        'Richard',
        'Joseph',
        'Thomas',
        'Charles',
      ],
      NG: [
        'Chidi',
        'Emeka',
        'Obinna',
        'Kelechi',
        'Ifeanyi',
        'Uchenna',
        'Nnamdi',
      ],
      SN: [
        'Moussa',
        'Mamadou',
        'Ismaila',
        'Sadio',
        'Baba',
        'Cheikh',
        'Moustapha',
        'Kalidou',
      ],
      JP: [
        'Haruki',
        'Haruto',
        'Yuto',
        'Sota',
        'Riku',
        'Kaito',
        'Hayato',
        'Soshi',
      ],
      KR: ['Jin', 'Min', 'Hyeok', 'Seo', 'Jun', 'Hyun', 'Dae', 'Woo'],
      MX: [
        'Diego',
        'Luis',
        'Carlos',
        'Jose',
        'Fernando',
        'Adrian',
        'Eduardo',
        'Javier',
      ],
    };
    const lastNames: Record<string, string[]> = {
      CN: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao'],
      GB: [
        'Smith',
        'Jones',
        'Williams',
        'Taylor',
        'Brown',
        'Wilson',
        'Evans',
        'Thomas',
      ],
      ES: [
        'Garcia',
        'Rodriguez',
        'Martinez',
        'Lopez',
        'Gonzalez',
        'Hernandez',
        'Perez',
        'Sanchez',
      ],
      BR: [
        'Silva',
        'Santos',
        'Oliveira',
        'Souza',
        'Lima',
        'Pereira',
        'Costa',
        'Ferreira',
      ],
      IT: [
        'Rossi',
        'Russo',
        'Ferrari',
        'Esposito',
        'Bianchi',
        'Romano',
        'Colombo',
        'Costa',
      ],
      FR: [
        'Martin',
        'Bernard',
        'Dubois',
        'Thomas',
        'Robert',
        'Richard',
        'Petit',
        'Durand',
      ],
      DE: [
        'Muller',
        'Schmidt',
        'Schneider',
        'Fischer',
        'Weber',
        'Meyer',
        'Wagner',
        'Becker',
      ],
      NL: [
        'Jansen',
        'de Vries',
        'van der Meer',
        'Bakker',
        'Visser',
        'Koning',
        'de Jong',
        'Dekker',
      ],
      AR: [
        'Garcia',
        'Lopez',
        'Martinez',
        'Rodriguez',
        'Gomez',
        'Fernandez',
        'Alvarez',
        'Ruiz',
      ],
      PT: [
        'Silva',
        'Santos',
        'Oliveira',
        'Sousa',
        'Lima',
        'Pereira',
        'Almeida',
        'Ferreira',
      ],
      US: [
        'Smith',
        'Johnson',
        'Williams',
        'Brown',
        'Jones',
        'Garcia',
        'Miller',
        'Davis',
      ],
      NG: [
        'Okonkwo',
        'Adeyemi',
        'Obi',
        'Nnamdi',
        'Eze',
        'Ogundimu',
        'Ayodele',
        'Umar',
      ],
      SN: ['Diallo', 'Sarr', 'Faye', 'Diop', 'Cisse', 'Sow', 'Ba', 'Ndiaye'],
      JP: [
        'Yamamoto',
        'Sato',
        'Suzuki',
        'Takahashi',
        'Tanaka',
        'Watanabe',
        'Ito',
        'Nakamura',
      ],
      KR: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Jang'],
      MX: [
        'Garcia',
        'Rodriguez',
        'Martinez',
        'Lopez',
        'Gonzalez',
        'Hernandez',
        'Perez',
        'Ramirez',
      ],
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
