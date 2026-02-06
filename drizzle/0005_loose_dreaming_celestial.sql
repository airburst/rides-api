CREATE INDEX IF NOT EXISTS "idx_rides_date_deleted" ON "bcc_rides" USING btree ("ride_date","deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rides_schedule_deleted" ON "bcc_rides" USING btree ("schedule_id","deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_on_rides_ride_created" ON "bcc_users_on_rides" USING btree ("ride_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_name_lower" ON "bcc_users" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email_lower" ON "bcc_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_membership_id" ON "bcc_users" USING btree ("membership_id") WHERE "bcc_users"."membership_id" IS NOT NULL;