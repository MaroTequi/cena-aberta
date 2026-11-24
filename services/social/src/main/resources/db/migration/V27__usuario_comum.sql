-- Funcionalidades do usuário comum: feed, metas, curtidas/comentários em resenhas e recomendações.
-- Compatível com H2 (MODE=PostgreSQL) e PostgreSQL 16. "year" é palavra reservada no H2, por isso goal_year.

-- Momento da última nota/resenha: ordena o feed de amigos. Linhas antigas ficam NULL (não entram no feed).
ALTER TABLE library ADD COLUMN rated_at timestamp with time zone;
ALTER TABLE library ADD COLUMN reviewed_at timestamp with time zone;
CREATE INDEX library_actor_rated ON library(actor,rated_at);
CREATE INDEX library_actor_reviewed ON library(actor,reviewed_at);
CREATE INDEX viewing_actor_watched_on ON viewing(actor,watched_on);

CREATE TABLE annual_goal (
 actor varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 goal_year integer NOT NULL CHECK(goal_year BETWEEN 1900 AND 2200),
 target integer NOT NULL CHECK(target BETWEEN 1 AND 1000),
 PRIMARY KEY(actor,goal_year)
);

CREATE TABLE review_like (
 author varchar(160) NOT NULL,
 title varchar(90) NOT NULL,
 liker varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 created timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(author,title,liker),
 FOREIGN KEY(author,title) REFERENCES library(actor,title) ON DELETE CASCADE,
 CHECK(author <> liker)
);

CREATE TABLE review_comment (
 id varchar(36) PRIMARY KEY,
 author varchar(160) NOT NULL,
 title varchar(90) NOT NULL,
 commenter varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 body varchar(1000) NOT NULL,
 created timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(author,title) REFERENCES library(actor,title) ON DELETE CASCADE
);
CREATE INDEX review_comment_review ON review_comment(author,title,created);

CREATE TABLE recommendation (
 id varchar(36) PRIMARY KEY,
 sender varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 recipient varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
 title varchar(90) NOT NULL,
 title_name varchar(300) NOT NULL,
 message varchar(300),
 created timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
 seen boolean NOT NULL DEFAULT false,
 UNIQUE(sender,recipient,title),
 CHECK(sender <> recipient)
);
CREATE INDEX recommendation_inbox ON recommendation(recipient,seen,created);
CREATE INDEX recommendation_sender_created ON recommendation(sender,created);
