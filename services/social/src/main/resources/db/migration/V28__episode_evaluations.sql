INSERT INTO library (actor,title,watched,rating,evaluation_public,hidden)
SELECT e.actor, concat('ep-',e.title,'-s',e.season,'-e',e.episode), TRUE, e.rating,
       COALESCE(l.evaluation_public,FALSE), COALESCE(l.hidden,FALSE)
FROM episode_rating e
LEFT JOIN library l ON l.actor=e.actor AND l.title=e.title;
