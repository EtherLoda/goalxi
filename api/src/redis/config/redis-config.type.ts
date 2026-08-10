export type RedisConfig = {
  host?: string;
  port: number;
  password?: string;
  tlsEnabled: boolean;
  /**
   * P2-#31: logical Redis DB number (0-15 by default, 0-∞ on
   * cluster). Lets dev / staging / prod share a Redis instance
   * without colliding on keys — set `REDIS_DB=0` for dev, `=1` for
   * staging, etc. Defaults to 0 to match the historical behaviour.
   */
  db: number;
};
