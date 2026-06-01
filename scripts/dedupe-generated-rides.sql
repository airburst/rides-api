-- Deduplicate generated rides
-- =================================================================
-- One-off cleanup for rides duplicated by a non-idempotent /generate run
-- (fixed in src/routes/generate.ts). A generated ride is uniquely identified
-- by (schedule_id, ride_date); this collapses each such group to a single row.
--
-- Keeper selection per (schedule_id, ride_date) group, in priority order:
--   1. NOT soft-deleted   (don't keep a deleted row over a live one)
--   2. most rider signups (preserve the instance people actually joined)
--   3. earliest created_at
--   4. lowest id          (final deterministic tiebreak)
-- Rider signups (users_on_rides) on the losing rows are RE-HOMED onto the
-- keeper before the losers are deleted, so no signup is lost. If a user was
-- signed up to both, the duplicate signup is dropped (ON CONFLICT DO NOTHING).
--
-- SAFETY: this script ends in ROLLBACK. Run it, review the printed
-- `dup_resolution` rows + the row counts, then change the final ROLLBACK to
-- COMMIT and run again to apply. Take a DB backup/snapshot first.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/dedupe-generated-rides.sql
-- =================================================================

-- ---- Step 0: read-only report (no transaction, safe to run anytime) --------
SELECT
  r.schedule_id,
  r.ride_date,
  count(*)                                              AS copies,
  sum((SELECT count(*) FROM users_on_rides u WHERE u.ride_id = r.id)) AS total_signups
FROM rides r
WHERE r.schedule_id IS NOT NULL
GROUP BY r.schedule_id, r.ride_date
HAVING count(*) > 1
ORDER BY r.ride_date;

-- ---- Step 1: resolve + apply inside a transaction --------------------------
BEGIN;

CREATE TEMP TABLE dup_resolution ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    r.id,
    r.schedule_id,
    r.ride_date,
    r.deleted,
    (SELECT count(*) FROM users_on_rides u WHERE u.ride_id = r.id) AS signups,
    r.created_at,
    row_number() OVER (
      PARTITION BY r.schedule_id, r.ride_date
      ORDER BY
        r.deleted ASC,
        (SELECT count(*) FROM users_on_rides u WHERE u.ride_id = r.id) DESC,
        r.created_at ASC,
        r.id ASC
    ) AS rn,
    count(*) OVER (PARTITION BY r.schedule_id, r.ride_date) AS grp_size
  FROM rides r
  WHERE r.schedule_id IS NOT NULL
)
SELECT
  loser.id           AS loser_id,
  keeper.id          AS keeper_id,
  loser.schedule_id,
  loser.ride_date,
  loser.signups      AS loser_signups
FROM ranked loser
JOIN ranked keeper
  ON keeper.schedule_id = loser.schedule_id
 AND keeper.ride_date   = loser.ride_date
 AND keeper.rn = 1
WHERE loser.grp_size > 1
  AND loser.rn > 1;

-- Rows that will be removed (loser_id) and their keeper
SELECT * FROM dup_resolution ORDER BY ride_date;

-- 1. Re-home signups from losing rides onto the keeper.
INSERT INTO users_on_rides (user_id, ride_id, notes, created_at)
SELECT u.user_id, dr.keeper_id, u.notes, u.created_at
FROM users_on_rides u
JOIN dup_resolution dr ON dr.loser_id = u.ride_id
ON CONFLICT (user_id, ride_id) DO NOTHING;

-- 2. Remove the (now-migrated) signup rows on the losers.
DELETE FROM users_on_rides
WHERE ride_id IN (SELECT loser_id FROM dup_resolution);

-- 3. Delete the duplicate rides.
DELETE FROM rides
WHERE id IN (SELECT loser_id FROM dup_resolution);

-- Remaining duplicate groups after cleanup (should be 0)
SELECT count(*) AS remaining_dup_groups
FROM (
  SELECT 1
  FROM rides
  WHERE schedule_id IS NOT NULL
  GROUP BY schedule_id, ride_date
  HAVING count(*) > 1
) g;

-- Review the output above. To APPLY, change ROLLBACK to COMMIT and re-run.
ROLLBACK;
