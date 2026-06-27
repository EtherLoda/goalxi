import {Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { UserGenerator } from './generators/user.generator';
import { LeagueGenerator } from './generators/league.generator';
import { TeamGenerator } from './generators/team.generator';
import { ScheduleGenerator } from './generators/schedule.generator';
import { WeatherGenerator } from './generators/weather.generator';

@Injectable()
export class BootstrapService implements OnModuleInit {

  constructor(
    @Inject(LOGGER_SERVICE)
  private readonly logger: PinoLoggerService,

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
      this.logger.info('[Bootstrap] Already initialized, skipping');
      return;
    }

    this.logger.info('[Bootstrap] Starting game initialization...');
    const start = Date.now();

    // 1. Create system users
    const { botUserId } = await this.userGenerator.ensureSystemUsers();
    this.logger.info('[Bootstrap] Users created');

    // 2. Create league pyramid
    await this.leagueGenerator.generatePyramid();
    this.logger.info('[Bootstrap] Leagues created');

    // 3. Create teams with players, staff, and facilities
    await this.teamGenerator.generateAllTeams(botUserId);
    this.logger.info('[Bootstrap] Teams created');

    // 4. Generate Season 1 schedule (week 1-16)
    await this.scheduleGenerator.generateSeason1Schedule();
    this.logger.info('[Bootstrap] Schedule created');

    // 5. Generate initial weather (settlement cron handles subsequent days)
    await this.weatherGenerator.generateInitialWeather();
    this.logger.info('[Bootstrap] Initial weather created');

    const elapsedMs = Date.now() - start;
    this.logger.info(`[Bootstrap] Initialization complete in ${elapsedMs}ms`);
  }
}
