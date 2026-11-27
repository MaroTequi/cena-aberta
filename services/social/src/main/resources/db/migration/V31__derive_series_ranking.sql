UPDATE profile SET ranking_version=ranking_version+1
WHERE EXISTS (SELECT 1 FROM film_ranking r WHERE r.actor=profile.actor
    AND (r.title LIKE 'tmdb-tv-%' OR r.title IN ('demo-mare-alta','demo-neon-norte','demo-arquipelago')));

DELETE FROM film_ranking
WHERE title LIKE 'tmdb-tv-%' OR title IN ('demo-mare-alta','demo-neon-norte','demo-arquipelago');
