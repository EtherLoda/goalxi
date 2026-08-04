// One-off: TRUNCATE scout_candidate via direct pg connection.
// Reads connection params from api/.env so we hit the same DB the API uses.

const fs = require('fs');
const path = require('path');
const { Client } = require('C:/Code/Project/GoalXI/node_modules/.pnpm/pg@8.16.3/node_modules/pg');

const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx <= 0) continue;
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[k] = v;
}

const cfg = {
  host: env.DATABASE_HOST,
  port: parseInt(env.DATABASE_PORT, 10),
  user: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
  database: env.DATABASE_NAME,
};

(async () => {
  const c = new Client(cfg);
  await c.connect();
  console.log('connected to', cfg.host + ':' + cfg.port + '/' + cfg.database);

  const before = await c.query('SELECT COUNT(*)::int AS n FROM scout_candidate');
  console.log('scout_candidate rows before:', before.rows[0]?.n ?? 0);

  await c.query('TRUNCATE scout_candidate RESTART IDENTITY CASCADE');
  console.log('truncated');

  const after = await c.query('SELECT COUNT(*)::int AS n FROM scout_candidate');
  console.log('scout_candidate rows after:', after.rows[0]?.n ?? 0);

  await c.end();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
