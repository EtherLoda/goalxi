import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserGenerator } from './generators/user.generator';
import { LeagueGenerator } from './generators/league.generator';
import { TeamGenerator } from './generators/team.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private userGenerator: UserGenerator,
    private leagueGenerator: LeagueGenerator,
    private teamGenerator: TeamGenerator,
    private scheduleGenerator: ScheduleGenerator,
    private weatherGenerator: WeatherGenerator,
  ) {}

  async onModuleInit() {
    const alreadyInitialized =
      await this.leagueGenerator.isAlreadyInitialized();
    if (alreadyInitialized) {
      this.logger.log('[Bootstrap] Already initialized, skipping');
      return;
    }

    this.logger.log('[Bootstrap] Starting game initialization...');
    const start = Date.now();

    // 1. Create system users
    const { botUserId } = await this.userGenerator.ensureSystemUsers();
    this.logger.log('[Bootstrap] Users created');

    // 2. Create league pyramid
    await this.leagueGenerator.generatePyramid();
    this.logger.log('[Bootstrap] Leagues created');

    // 3. Create teams with players, staff, and facilities
    await this.teamGenerator.generateAllTeams(botUserId);
    this.logger.log('[Bootstrap] Teams created');

    // 4. Generate Season 1 schedule (week 1-16)
    await this.scheduleGenerator.generateSeason1Schedule();
    this.logger.log('[Bootstrap] Schedule created');

    // 5. Generate initial weather (settlement cron handles subsequent days)
    await this.weatherGenerator.generateInitialWeather();
    this.logger.log('[Bootstrap] Initial weather created');

    const elapsedMs = Date.now() - start;
    this.logger.log(`[Bootstrap] Initialization complete in ${elapsedMs}ms`);
  }
}
