-- Drop FK constraints referencing clubs.id before changing its type
ALTER TABLE "club_api_keys" DROP CONSTRAINT "club_api_keys_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "user_clubs" DROP CONSTRAINT "user_clubs_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "archived_rides" DROP CONSTRAINT "archived_rides_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "repeating_rides" DROP CONSTRAINT "repeating_rides_club_id_clubs_id_fk";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_club_id_clubs_id_fk";--> statement-breakpoint

-- Drop slug unique index
DROP INDEX "clubs_slug_unique";--> statement-breakpoint

-- Backfill existing club record with a valid UUID
UPDATE "club_api_keys" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "user_clubs" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "archived_rides" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "memberships" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "repeating_rides" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "rides" SET "club_id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "club_id" = 'bcc';--> statement-breakpoint
UPDATE "clubs" SET "id" = '5cfb9e03-db2d-4371-b795-8402879f01f9' WHERE "id" = 'bcc';--> statement-breakpoint

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
