---
"rides-api": minor
---

Multi-tenancy schema (additive). New tables `clubs`, `user_clubs`, `club_api_keys`. Nullable `club_id` columns on rides/repeating_rides/archived_rides/memberships. New `users.is_super_admin` boolean. BCC seeded as default club; existing data backfilled to it. `users.role` retained for now (dropped in finalize migration once code paths switch to `user_clubs.role`).
