-- Delete all records for a user by email.
-- Set the email below, then run against the database.

DO $$
DECLARE
  _email text := 'user@example.com';  -- <-- change this
BEGIN
  DELETE FROM bcc_accounts WHERE "userId" IN (SELECT id FROM bcc_users WHERE email = _email);
  DELETE FROM bcc_sessions WHERE "userId" IN (SELECT id FROM bcc_users WHERE email = _email);
  DELETE FROM bcc_users WHERE email = _email;
END $$;
