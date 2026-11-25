CREATE TABLE review_report (
    id varchar(36) PRIMARY KEY,
    reporter varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
    author varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
    title varchar(90) NOT NULL,
    review_version integer NOT NULL,
    review_text varchar(3000) NOT NULL,
    reason varchar(20) NOT NULL CHECK(reason IN ('spoiler','harassment','hate','spam','inappropriate','off_topic','other')),
    details varchar(500) NOT NULL,
    created timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved boolean NOT NULL DEFAULT false,
    UNIQUE(reporter,author,title,review_version),
    CHECK(reporter <> author)
);
CREATE INDEX review_report_queue ON review_report(resolved,created,id);
