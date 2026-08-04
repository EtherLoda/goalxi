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
  const users = await c.query('SELECT id, email, username, supporter_level FROM "user" WHERE deleted_at IS NULL ORDER BY supporter_level DESC, email LIMIT 20');
  console.log('users:', users.rows.length);
  for (const u of users.rows) {
    console.log(`  ${u.email} (${u.username}) supporter=${u.supporter_level} id=${u.id}`);
  }
  const teams = await c.query('SELECT id, user_id, name, is_bot FROM team WHERE deleted_at IS NULL ORDER BY is_bot LIMIT 10');
  console.log('teams:', teams.rows.length);
  for (const t of teams.rows) {
    console.log(`  ${t.name} (bot=${t.is_bot}) user_id=${t.user_id}`);
  }
  await c.end();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
