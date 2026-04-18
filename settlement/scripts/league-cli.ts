/**
 * League CLI - Generate new league system from YAML config
 *
 * Usage:
 *   pnpm cli:league --config scripts/configs/usa.yaml
 *   pnpm cli:league --config scripts/configs/usa.yaml --force
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import { DataSource } from 'typeorm';
import { LeagueEntity } from '@goalxi/database';

interface LeagueConfig {
  country: string;
  name: string;
  tierNum: number;
  cities: string[];
  suffixes: string[];
}

async function main() {
  // Parse CLI args
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      force: { type: 'boolean', short: 'f', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || !values.config) {
    console.log(`
League CLI - Generate new league system from YAML config

Usage:
  pnpm cli:league --config <path-to-yaml>
  pnpm cli:league --config <path-to-yaml> --force

Options:
  --config, -c   Path to YAML config file (required)
  --force, -f     Force regeneration even if league exists
  --help, -h      Show this help message

YAML Structure:
  country: USA           # Country code
  name: American Soccer  # League system name
  tierNum: 3             # Number of tiers (1=1, 2=5, 3=21, 4=85 leagues)
  cities: [...]          # City names for team naming
  suffixes: [FC, United, SC, City]  # Team name suffixes
    `);
    process.exit(0);
  }

  const configPath = path.resolve(values.config as string);

  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  // Load YAML config
  const yaml = await import('yaml');
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config: LeagueConfig = yaml.parse(configContent);

  console.log(`[League CLI] Loading config from: ${configPath}`);
  console.log(`[League CLI] Country: ${config.country}`);
  console.log(`[League CLI] League system: ${config.name}`);
  console.log(`[League CLI] Tiers: ${config.tierNum}`);
  console.log(`[League CLI] Cities: ${config.cities.length}`);
  console.log(`[League CLI] Suffixes: ${config.suffixes.join(', ')}`);

  // Calculate pyramid structure
  const totalLeagues = calculateTotalLeagues(config.tierNum);
  console.log(`[League CLI] Total leagues: ${totalLeagues}`);

  // Create DataSource
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'goalxi',
    entities: [LeagueEntity],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('[League CLI] Database connected');

  const leagueRepo = dataSource.getRepository(LeagueEntity);

  // Check if top-level league already exists (use first league name as marker)
  const topLeagueName = `${config.country} ${config.name}`;
  const existingLeague = await leagueRepo.findOne({
    where: { name: topLeagueName },
  });

  if (existingLeague) {
    if (values.force) {
      console.log(
        `[League CLI] League system exists, deleting for regeneration...`,
      );
      // Delete all leagues that start with country prefix
      await leagueRepo
        .createQueryBuilder()
        .delete()
        .where('name LIKE :prefix', { prefix: `${config.country} %` })
        .execute();
      console.log(`[League CLI] Deleted existing league system`);
    } else {
      console.log(
        `[League CLI] League system "${topLeagueName}" already exists. Use --force to regenerate.`,
      );
      await dataSource.destroy();
      process.exit(0);
    }
  }

  // Generate pyramid
  await generatePyramid(leagueRepo, config);

  console.log(
    '[League CLI] League system will be ready for Season 2 schedule generation',
  );
  console.log('[League CLI] Done!');

  await dataSource.destroy();
  process.exit(0);
}

function calculateTotalLeagues(tierNum: number): number {
  let total = 0;
  for (let i = 0; i < tierNum; i++) {
    total += Math.pow(4, i);
  }
  return total;
}

async function generatePyramid(
  leagueRepo: ReturnType<
    typeof DataSource.prototype.getRepository<LeagueEntity>
  >,
  config: LeagueConfig,
): Promise<void> {
  const { country, name, tierNum, cities, suffixes } = config;

  // Distribute cities across all tiers
  // Each league has maxTeams (currently 16)
  // Total teams = sum of (leagues at tier * maxTeams)
  const maxTeamsPerLeague = 16;
  const totalTeams = calculateTotalLeagues(tierNum) * maxTeamsPerLeague;

  if (cities.length < totalTeams) {
    console.warn(
      `[League CLI] Warning: only ${cities.length} cities provided, need ${totalTeams}`,
    );
  }

  const citiesPerSuffix = Math.ceil(cities.length / suffixes.length);

  // Store created leagues by tier for parent linking
  const leaguesByTier: Map<number, LeagueEntity[]> = new Map();

  for (let tier = 1; tier <= tierNum; tier++) {
    const leagueCount = Math.pow(4, tier - 1);
    const tierLeagues: LeagueEntity[] = [];

    for (let div = 1; div <= leagueCount; div++) {
      // Determine parent league
      let parentLeagueId: string | undefined;
      if (tier > 1) {
        // L2-L4: parent is L(tier-1) division ceil(div/4)
        const parentDiv = Math.ceil(div / 4);
        const parentTier = tierLeagues.length > 0 ? tier - 1 : 1;
        const parent = leaguesByTier
          .get(parentTier)
          ?.find((_, idx) => idx + 1 === parentDiv);
        parentLeagueId = parent?.id;
      }

      // Generate league name
      const leagueName = generateLeagueName(
        country,
        name,
        tier,
        div,
        leagueCount,
      );

      const league = leagueRepo.create({
        name: leagueName,
        tier,
        tierDivision: div,
        maxTeams: maxTeamsPerLeague,
        promotionSlots: 1,
        playoffSlots: 4,
        relegationSlots: 4,
        status: 'active',
        parentLeagueId: parentLeagueId ?? undefined,
      });

      await leagueRepo.save(league);
      tierLeagues.push(league);
      console.log(
        `[League CLI] Created: ${leagueName} (tier ${tier}, parent: ${parentLeagueId || 'none'})`,
      );
    }

    leaguesByTier.set(tier, tierLeagues);
  }
}

function generateLeagueName(
  country: string,
  name: string,
  tier: number,
  division: number,
  totalInTier: number,
): string {
  const tierNames: Record<number, string[]> = {
    1: ['', ''], // Not used for L1
    2: ['Championship', 'Division'],
    3: ['III', 'Division'],
    4: ['IV', 'Division'],
  };

  if (tier === 1) {
    return `${country} ${name}`;
  }

  const prefix = tierNames[tier]?.[0] || `Tier ${tier}`;
  const suffix = tierNames[tier]?.[1] || 'Division';

  if (totalInTier === 1) {
    return `${country} ${name} ${prefix}`;
  }

  return `${country} ${name} ${prefix} ${division}`;
}

main().catch((err) => {
  console.error('[League CLI] Error:', err);
  process.exit(1);
});
