-- Login com o Google: liga o identificador da pessoa no Google (sub) à conta do Cena Aberta.
-- O e-mail serve só para achar a conta no primeiro login; depois vale o sub, mesmo se o e-mail mudar no Google.
-- Compatível com H2 (MODE=PostgreSQL) e PostgreSQL 16.
CREATE TABLE google_identity (
 subject varchar(255) PRIMARY KEY,
 actor varchar(160) NOT NULL UNIQUE REFERENCES email_account(actor) ON DELETE CASCADE,
 linked_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
