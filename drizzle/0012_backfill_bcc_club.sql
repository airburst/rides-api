INSERT INTO "clubs" ("id", "slug", "name", "settings", "allowed_origins", "created_at", "updated_at")
VALUES ('bcc', 'bcc', 'Bristol Cycling Club', '{}'::jsonb, '[]'::jsonb, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "rides" SET "club_id" = 'bcc' WHERE "club_id" IS NULL;
--> statement-breakpoint
UPDATE "repeating_rides" SET "club_id" = 'bcc' WHERE "club_id" IS NULL;
--> statement-breakpoint
UPDATE "archived_rides" SET "club_id" = 'bcc' WHERE "club_id" IS NULL;
--> statement-breakpoint
UPDATE "memberships" SET "club_id" = 'bcc' WHERE "club_id" IS NULL;
--> statement-breakpoint
INSERT INTO "user_clubs" ("user_id", "club_id", "role", "joined_at")
SELECT "id", 'bcc', COALESCE("role", 'USER'), now()
FROM "users"
ON CONFLICT ("user_id", "club_id") DO NOTHING;
