UPDATE profile SET ranking_version=ranking_version+1
WHERE EXISTS (SELECT 1 FROM film_ranking r WHERE r.actor=profile.actor AND r.title LIKE 'season-%');

DELETE FROM film_ranking WHERE title LIKE 'season-%';

UPDATE library SET rating=NULL, watched=FALSE
WHERE title LIKE 'season-%';

INSERT INTO library (actor,title,evaluation_public)
SELECT DISTINCT e.actor, concat('season-',regexp_replace(substring(e.title,4),'-e[0-9]+$','')), FALSE
FROM library e
WHERE e.title LIKE 'ep-%' AND e.watched
  AND NOT EXISTS (
      SELECT 1 FROM library s WHERE s.actor=e.actor
        AND s.title=concat('season-',regexp_replace(substring(e.title,4),'-e[0-9]+$',''))
  );

UPDATE library AS s SET watched=TRUE,interest=FALSE
WHERE s.title LIKE 'season-%' AND EXISTS (
    SELECT 1 FROM library e WHERE e.actor=s.actor AND e.watched
      AND e.title LIKE concat('ep-',substring(s.title,8),'-e%')
);

UPDATE library SET rewatching=FALSE WHERE title LIKE 'season-%' AND NOT watched;
