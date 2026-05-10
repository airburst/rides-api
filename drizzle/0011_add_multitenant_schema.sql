CREATE TABLE "club_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text,
	"hashed_key" text NOT NULL,
	"label" varchar(255),
	"last_used_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_clubs" (
	"user_id" varchar(255) NOT NULL,
	"club_id" text NOT NULL,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"joined_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "user_clubs_user_id_club_id_pk" PRIMARY KEY("user_id","club_id")
);
--> statement-breakpoint
ALTER TABLE "archived_rides" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "repeating_rides" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "club_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_api_keys" ADD CONSTRAINT "club_api_keys_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_clubs" ADD CONSTRAINT "user_clubs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_api_keys_hashed_key_unique" ON "club_api_keys" USING btree ("hashed_key");--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_slug_unique" ON "clubs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_user_clubs_club_id" ON "user_clubs" USING btree ("club_id");--> statement-breakpoint
ALTER TABLE "archived_rides" ADD CONSTRAINT "archived_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repeating_rides" ADD CONSTRAINT "repeating_rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_archived_rides_club_id" ON "archived_rides" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_club_id" ON "memberships" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_repeating_rides_club_id" ON "repeating_rides" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_rides_club_deleted_date" ON "rides" USING btree ("club_id","deleted","ride_date");