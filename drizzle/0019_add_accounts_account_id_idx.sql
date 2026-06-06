-- Add index on accounts.account_id for Better Auth JWT lookup
-- Supabase recommends this index (78.14% cost reduction: 21.77 → 4.76)
-- Used during auth flow when resolving accounts by provider account id

CREATE INDEX CONCURRENTLY IF NOT EXISTS accounts_account_id_idx ON accounts(account_id);
