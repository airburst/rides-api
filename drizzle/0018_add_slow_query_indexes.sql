-- Add missing indexes on high-traffic query paths
-- Based on Supabase slow query analysis and profiling

-- Auth lookup optimization: user_clubs by user_id (5,632 calls, 1,834ms total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_clubs_user_id_idx ON user_clubs(user_id);--> statement-breakpoint

-- Ride list filtering: rides by ride_date (2,817 calls, 4,533ms total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS rides_ride_date_idx ON rides(ride_date);--> statement-breakpoint

-- Ride detail lateral join: users_on_rides by ride_id (4,989 calls + lateral lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_on_rides_ride_id_idx ON users_on_rides(ride_id);
