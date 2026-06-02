-- users: email_verified timestamp → boolean, add last_login_at
ALTER TABLE "users" ALTER COLUMN "email_verified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DATA TYPE boolean USING ("email_verified" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp(3);--> statement-breakpoint

-- accounts: reshape to better-auth format, preserving Auth0 account rows
CREATE TABLE "accounts_new" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL,
  "password" text,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp(3),
  "refresh_token_expires_at" timestamp(3),
  "scope" text,
  "created_at" timestamp(3) NOT NULL DEFAULT now(),
  "updated_at" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "accounts_new_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);--> statement-breakpoint

INSERT INTO "accounts_new" ("id", "account_id", "provider_id", "user_id", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "provider_account_id", "provider", "user_id", now(), now()
FROM "accounts";--> statement-breakpoint

DROP TABLE "accounts";--> statement-breakpoint
ALTER TABLE "accounts_new" RENAME TO "accounts";--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint

-- sessions: drop NextAuth legacy table, recreate with better-auth shape (was empty)
DROP TABLE "sessions";--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" text PRIMARY KEY,
  "expires_at" timestamp(3) NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT now(),
  "updated_at" timestamp(3) NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL,
  CONSTRAINT "sessions_token_unique" UNIQUE ("token"),
  CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint

-- verification_tokens: drop NextAuth legacy table, recreate as verification (was empty)
DROP TABLE "verification_tokens";--> statement-breakpoint
CREATE TABLE "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp(3) NOT NULL,
  "created_at" timestamp(3),
  "updated_at" timestamp(3)
);
