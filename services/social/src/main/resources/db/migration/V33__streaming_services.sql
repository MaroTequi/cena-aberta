-- Onde assistir: serviços de streaming que cada pessoa assina (ids do TMDB) e o filtro das salas por esses serviços.
-- Compatível com H2 (MODE=PostgreSQL) e PostgreSQL 16.
CREATE TABLE actor_provider (
 actor varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 provider integer NOT NULL CHECK(provider > 0),
 PRIMARY KEY(actor,provider)
);

-- Quando true, a sala só recebe obras incluídas em algum serviço assinado por um participante.
ALTER TABLE movie_room ADD COLUMN subscribed_only boolean NOT NULL DEFAULT false;
