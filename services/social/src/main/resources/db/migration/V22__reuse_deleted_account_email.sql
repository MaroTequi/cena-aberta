ALTER TABLE email_account ADD COLUMN archived_email varchar(254);
ALTER TABLE email_account ALTER COLUMN email DROP NOT NULL;

DELETE FROM email_link WHERE email IN (SELECT email FROM email_account WHERE state='deleted');
UPDATE email_account SET archived_email=email, email=NULL WHERE state='deleted';
ALTER TABLE email_account ADD CONSTRAINT email_account_login_address CHECK (
    (state='deleted' AND email IS NULL AND archived_email IS NOT NULL) OR
    (state<>'deleted' AND email IS NOT NULL AND archived_email IS NULL)
);

ALTER TABLE email_link ADD COLUMN reset_actor varchar(160) REFERENCES email_account(actor);
UPDATE email_link SET reset_actor=(SELECT actor FROM email_account WHERE email_account.email=email_link.email)
WHERE purpose='reset';
DELETE FROM email_link WHERE purpose='reset' AND reset_actor IS NULL;
ALTER TABLE email_link ADD CONSTRAINT email_link_reset_owner CHECK (
    (purpose='reset' AND reset_actor IS NOT NULL) OR (purpose='register' AND reset_actor IS NULL)
);
