---
"rides-api": major
---

Multi-tenant API. **Breaking** — every authed request now requires `X-Club-Id` (header) or `?club=<slug>` (query), validated against `user_clubs` membership. Compat-mode default (`STRICT_TENANCY` unset) falls back to `DEFAULT_CLUB_SLUG` (default `bcc`) so the legacy frontend keeps working until it's updated; flip `STRICT_TENANCY=true` for hard 400s on missing club.

- Per-club roles via `user_clubs.role`; `users.role` removed.
- Global `users.is_super_admin` bypasses all club checks.
- New `/clubs` management endpoints (CRUD, members, role updates).
- `/generate` now requires super-admin (was ADMIN); loops all clubs.
- `/riderhq` BCC-scoped at code level (sunsetting feature; env vars only).
- `/archive` operates globally as before; archived rows preserve clubId.
- Cache keys gain clubId prefix: `rides:${clubId}:list:*`, `rides:${clubId}:detail:*`.
- `/users/me` payload gains `clubs` array (per-club role memberships); legacy `role` field removed from user records.

Migration path for production: run `bun run db:migrate` (applies 0010–0013 in order). After deploy, set yourself as super-admin: `UPDATE users SET is_super_admin = true WHERE email = 'you@example.com';`. Frontend update can land any time before flipping `STRICT_TENANCY=true`.
