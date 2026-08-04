SELECT l.id, l.name, l.tier, l."tierDivision", COUNT(t.id) AS team_count
FROM league l
LEFT JOIN team t ON t.league_id = l.id
GROUP BY l.id, l.name, l.tier, l."tierDivision"
ORDER BY l.tier, l."tierDivision";

SELECT t.id, t.user_id, t.name, u.email, t.is_bot
FROM team t
LEFT JOIN league l ON l.id = t.league_id
LEFT JOIN "user" u ON u.id = t.user_id
WHERE l.tier = 2 AND l."tierDivision" = 1;
