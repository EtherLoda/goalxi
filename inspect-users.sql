SELECT id, email, username FROM "user" ORDER BY created_at LIMIT 10;
SELECT t.id, t.user_id, t.name, u.email FROM team t LEFT JOIN "user" u ON u.id = t.user_id WHERE t.user_id IS NOT NULL ORDER BY u.email LIMIT 15;
SELECT (SELECT COUNT(*) FROM "user") AS user_count, (SELECT COUNT(*) FROM team) AS team_count, (SELECT COUNT(*) FROM team WHERE user_id IS NOT NULL) AS user_owned_teams;
