SELECT u.id, u.email, t.id AS team_id, t.name AS team_name
FROM "user" u
LEFT JOIN team t ON t.user_id = u.id
WHERE u.email LIKE '%@goalxi.com'
ORDER BY u.email;
