UPDATE team
SET user_id = '2225fa26-78e0-400f-a260-0bbedf47adf8'
WHERE id = 'c5c7ee44-4a5e-4df8-ba5c-46c5ab9939df'
RETURNING id, user_id, name;
