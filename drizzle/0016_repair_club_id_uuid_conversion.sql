DO $$
DECLARE
  clubs_id_type text;
BEGIN
  SELECT c.data_type
  INTO clubs_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'clubs'
    AND c.column_name = 'id';

  -- If clubs.id is still text, remap all legacy ids to UUIDs first.
  IF clubs_id_type = 'text' THEN
    EXECUTE 'ALTER TABLE "club_api_keys" DROP CONSTRAINT IF EXISTS "club_api_keys_club_id_clubs_id_fk"';
    EXECUTE 'ALTER TABLE "user_clubs" DROP CONSTRAINT IF EXISTS "user_clubs_club_id_clubs_id_fk"';
    EXECUTE 'ALTER TABLE "archived_rides" DROP CONSTRAINT IF EXISTS "archived_rides_club_id_clubs_id_fk"';
    EXECUTE 'ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_club_id_clubs_id_fk"';
    EXECUTE 'ALTER TABLE "repeating_rides" DROP CONSTRAINT IF EXISTS "repeating_rides_club_id_clubs_id_fk"';
    EXECUTE 'ALTER TABLE "rides" DROP CONSTRAINT IF EXISTS "rides_club_id_clubs_id_fk"';

    CREATE TEMP TABLE "_club_id_map" (
      "old_id" text PRIMARY KEY,
      "new_id" uuid NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO "_club_id_map" ("old_id", "new_id")
    SELECT
      "id",
      CASE
        WHEN "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN "id"::uuid
        ELSE gen_random_uuid()
      END
    FROM "clubs";

    UPDATE "club_api_keys" cak
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE cak."club_id" = m."old_id";

    UPDATE "user_clubs" uc
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE uc."club_id" = m."old_id";

    UPDATE "archived_rides" ar
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE ar."club_id" = m."old_id";

    UPDATE "memberships" mbr
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE mbr."club_id" = m."old_id";

    UPDATE "repeating_rides" rr
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE rr."club_id" = m."old_id";

    UPDATE "rides" r
    SET "club_id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE r."club_id" = m."old_id";

    UPDATE "clubs" c
    SET "id" = m."new_id"::text
    FROM "_club_id_map" m
    WHERE c."id" = m."old_id";

    EXECUTE 'ALTER TABLE "clubs" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid';
    EXECUTE 'ALTER TABLE "clubs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'club_api_keys'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "club_api_keys" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'user_clubs'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "user_clubs" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'archived_rides'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "archived_rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'memberships'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "memberships" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'repeating_rides'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "repeating_rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'rides'
      AND c.column_name = 'club_id'
      AND c.data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE "rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING "club_id"::uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'club_api_keys_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "club_api_keys" ADD CONSTRAINT "club_api_keys_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_clubs_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'archived_rides_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "archived_rides" ADD CONSTRAINT "archived_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repeating_rides_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "repeating_rides" ADD CONSTRAINT "repeating_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rides_club_id_clubs_id_fk'
  ) THEN
    EXECUTE 'ALTER TABLE "rides" ADD CONSTRAINT "rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action';
  END IF;
END $$;--> statement-breakpoint