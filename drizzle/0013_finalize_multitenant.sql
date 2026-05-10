ALTER TABLE "archived_rides" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repeating_rides" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";