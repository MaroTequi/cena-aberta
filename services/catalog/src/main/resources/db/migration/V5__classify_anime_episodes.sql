UPDATE title AS e SET anime=TRUE
WHERE e.format='ep' AND NOT e.anime AND (
    e.id LIKE 'ep-demo-neon-norte-s%'
    OR EXISTS (
        SELECT 1 FROM title s
        WHERE s.id=regexp_replace(substring(e.id,4),'-s[0-9]+-e[0-9]+$','')
          AND s.format='tv' AND s.anime
    )
);
