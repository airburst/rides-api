-- Drop FK constraints referencing clubs.id before changing its type
ALTER TABLE "club_api_keys" DROP CONSTRAINT "club_api_keys_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "user_clubs" DROP CONSTRAINT "user_clubs_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "archived_rides" DROP CONSTRAINT "archived_rides_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "repeating_rides" DROP CONSTRAINT "repeating_rides_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_club_id_clubs_id_fk";--> statement-breakpoint

-- Drop slug unique index
DROP INDEX "clubs_slug_unique";--> statement-breakpoint

-- Map every existing text club id to a generated UUID before casting.
CREATE TEMP TABLE "_club_id_map" (
	"old_id" text PRIMARY KEY,
	"new_id" uuid NOT NULL
);--> statement-breakpoint

INSERT INTO "_club_id_map" ("old_id", "new_id")
SELECT "id", gen_random_uuid()
FROM "clubs";--> statement-breakpoint

UPDATE "club_api_keys" cak
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE cak."club_id" = m."old_id";--> statement-breakpoint

UPDATE "user_clubs" uc
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE uc."club_id" = m."old_id";--> statement-breakpoint

UPDATE "archived_rides" ar
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE ar."club_id" = m."old_id";--> statement-breakpoint

UPDATE "memberships" mbr
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE mbr."club_id" = m."old_id";--> statement-breakpoint

UPDATE "repeating_rides" rr
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE rr."club_id" = m."old_id";--> statement-breakpoint

UPDATE "rides" r
SET "club_id" = m."new_id"::text
FROM "_club_id_map" m
WHERE r."club_id" = m."old_id";--> statement-breakpoint

UPDATE "clubs" c
SET "id" = m."new_id"::text
FROM "_club_id_map" m
WHERE c."id" = m."old_id";--> statement-breakpoint

-- Change clubs.id to uuid
ALTER TABLE "clubs" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint

-- Change all FK columns to uuid
ALTER TABLE "club_api_keys" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint
ALTER TABLE "user_clubs" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint
ALTER TABLE "archived_rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint
ALTER TABLE "repeating_rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "club_id" SET DATA TYPE uuid USING club_id::uuid;--> statement-breakpoint

-- Re-add FK constraints
ALTER TABLE "club_api_keys" ADD CONSTRAINT "club_api_keys_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_rides" ADD CONSTRAINT "archived_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repeating_rides" ADD CONSTRAINT "repeating_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;

DROP TABLE "_club_id_map";
