CREATE TABLE review_spoiler_vote (
    author varchar(160) NOT NULL,
    title varchar(90) NOT NULL,
    voter varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
    contains_spoiler boolean NOT NULL,
    PRIMARY KEY(author,title,voter),
    FOREIGN KEY(author,title) REFERENCES library(actor,title) ON DELETE CASCADE,
    CHECK(author <> voter)
);
