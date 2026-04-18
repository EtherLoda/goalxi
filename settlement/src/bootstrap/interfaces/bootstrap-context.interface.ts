/**
 * BootstrapContext - Shared context passed through all bootstrap generators
 * Carries references to repositories and system-wide config
 */

import { Repository } from 'typeorm';
import { UserEntity } from '@goalxi/database';

export interface BootstrapContext {
  systemUserId: string;
  botUserId: string;
}

export interface BootstrapResult {
  leaguesCreated: number;
  teamsCreated: number;
  playersCreated: number;
  staffCreated: number;
  matchesCreated: number;
  weatherDaysGenerated: number;
  elapsedMs: number;
}
