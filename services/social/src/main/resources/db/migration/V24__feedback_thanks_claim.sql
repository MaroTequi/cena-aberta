ALTER TABLE feedback_thanks ADD COLUMN claim_id varchar(36);
ALTER TABLE feedback_thanks ADD COLUMN claimed_at timestamp with time zone;
ALTER TABLE feedback_thanks ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE feedback_thanks ADD COLUMN queued_at timestamp with time zone;
ALTER TABLE feedback_thanks ALTER COLUMN queued_at SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX feedback_thanks_due ON feedback_thanks(state,needs_review,next_attempt);
