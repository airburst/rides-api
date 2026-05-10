ALTER TABLE "bcc_users" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "bcc_accounts" RENAME TO "accounts";--> statement-breakpoint
ALTER TABLE "bcc_sessions" RENAME TO "sessions";--> statement-breakpoint
ALTER TABLE "bcc_verification_tokens" RENAME TO "verification_tokens";--> statement-breakpoint
ALTER TABLE "bcc_rides" RENAME TO "rides";--> statement-breakpoint
ALTER TABLE "bcc_users_on_rides" RENAME TO "users_on_rides";--> statement-breakpoint
ALTER TABLE "bcc_repeating_rides" RENAME TO "repeating_rides";--> statement-breakpoint
ALTER TABLE "bcc_archived_rides" RENAME TO "archived_rides";--> statement-breakpoint
ALTER TABLE "bcc_archived_users_on_rides" RENAME TO "archived_users_on_rides";--> statement-breakpoint
ALTER TABLE "bcc_membership" RENAME TO "memberships";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "bcc_accounts_user_id_bcc_users_id_fk" TO "accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "bcc_sessions_user_id_bcc_users_id_fk" TO "sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "users_on_rides" RENAME CONSTRAINT "bcc_users_on_rides_ride_id_bcc_rides_id_fk" TO "users_on_rides_ride_id_rides_id_fk";--> statement-breakpoint
ALTER TABLE "users_on_rides" RENAME CONSTRAINT "bcc_users_on_rides_user_id_bcc_users_id_fk" TO "users_on_rides_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "bcc_accounts_provider_provider_account_id_pk" TO "accounts_provider_provider_account_id_pk";--> statement-breakpoint
ALTER TABLE "users_on_rides" RENAME CONSTRAINT "bcc_users_on_rides_user_id_ride_id_pk" TO "users_on_rides_user_id_ride_id_pk";--> statement-breakpoint
ALTER TABLE "archived_users_on_rides" RENAME CONSTRAINT "bcc_archived_users_on_rides_user_id_ride_id_pk" TO "archived_users_on_rides_user_id_ride_id_pk";--> statement-breakpoint
ALTER TABLE "verification_tokens" RENAME CONSTRAINT "bcc_verification_tokens_identifier_token_pk" TO "verification_tokens_identifier_token_pk";--> statement-breakpoint
ALTER INDEX "bcc_rides_name_index" RENAME TO "rides_name_index";--> statement-breakpoint
ALTER INDEX "bcc_archived_rides_name_index" RENAME TO "archived_rides_name_index";--> statement-breakpoint
ALTER INDEX "bcc_repeating_rides_name_index" RENAME TO "repeating_rides_name_index";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "bcc_users_pkey" TO "users_pkey";--> statement-breakpoint
ALTER TABLE "rides" RENAME CONSTRAINT "bcc_rides_pkey" TO "rides_pkey";--> statement-breakpoint
ALTER TABLE "repeating_rides" RENAME CONSTRAINT "bcc_repeating_rides_pkey" TO "repeating_rides_pkey";--> statement-breakpoint
ALTER TABLE "archived_rides" RENAME CONSTRAINT "bcc_archived_rides_pkey" TO "archived_rides_pkey";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "bcc_sessions_pkey" TO "sessions_pkey";--> statement-breakpoint
ALTER TABLE "memberships" RENAME CONSTRAINT "bcc_membership_pkey" TO "memberships_pkey";
