CREATE TABLE review_release_date (
    title varchar(90) PRIMARY KEY,
    name varchar(500) NOT NULL,
    released date,
    checked_at timestamp with time zone NOT NULL
);
