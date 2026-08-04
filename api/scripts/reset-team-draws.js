const fs = require("fs");
const path = require("path");
const { Client } = require("C:/Code/Project/GoalXI/node_modules/.pnpm/pg@8.16.3/node_modules/pg");

const envPath = path.join(__dirname, "..", ".env");
const envText = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx <= 0) continue;
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[k] = v;
}

(async () => {
  const c = new Client({
    host: env.DATABASE_HOST,
    port: parseInt(env.DATABASE_PORT, 10),
    user: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
  });
  await c.connect();

  const email = process.argv[2] || "test@goalxi.com";
  const r = await c.query(
    'UPDATE team SET scout_draws_this_week=0, scout_week_index=NULL WHERE user_id=(SELECT id FROM "user" WHERE email=$1)',
    [email],
  );
  console.log("reset rows:", r.rowCount);

  // Also delete any leftover scout candidates for that team so we
  // start with a clean inbox for the test.
  const t = await c.query(
    'SELECT id FROM team WHERE user_id=(SELECT id FROM "user" WHERE email=$1) AND is_bot=false LIMIT 1',
    [email],
  );
  if (t.rows.length > 0) {
    const tid = t.rows[0].id;
    const d = await c.query("DELETE FROM scout_candidate WHERE team_id=$1", [tid]);
    console.log("cleared candidates:", d.rowCount);
  }

  await c.end();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
