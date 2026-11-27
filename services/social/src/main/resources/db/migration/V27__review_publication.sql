ALTER TABLE library ADD COLUMN review_published_at timestamp with time zone;
CREATE INDEX library_review_date ON library(title, review_published_at);
