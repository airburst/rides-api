ALTER TABLE "bcc_archived_users_on_rides" DROP CONSTRAINT "bcc_archived_users_on_rides_user_id_bcc_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bcc_archived_users_on_rides" DROP CONSTRAINT "bcc_archived_users_on_rides_ride_id_bcc_archived_rides_id_fk";
--> statement-breakpoint
DROP INDEX "idx_rides_schedule_deleted";--> statement-breakpoint
DROP INDEX "idx_users_membership_id";--> statement-breakpoint
ALTER TABLE "bcc_repeating_rides" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "bcc_repeating_rides" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "bcc_users" ALTER COLUMN "email_verified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bcc_users" ADD COLUMN "image_large" text;