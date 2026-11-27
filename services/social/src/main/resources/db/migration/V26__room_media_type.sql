ALTER TABLE movie_room ADD COLUMN media_type varchar(8) NOT NULL DEFAULT 'movie' CHECK(media_type IN ('all','movie','tv','anime'));
ALTER TABLE movie_room ALTER COLUMN media_type SET DEFAULT 'all';
