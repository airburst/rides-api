---
"rides-api": patch
---

Drop `bcc_` table prefix. Tables renamed via ALTER TABLE; `membership` → `memberships` plural at the same time. No behaviour change. FK constraints and indexes renamed to match. Prep work for multi-tenancy.
