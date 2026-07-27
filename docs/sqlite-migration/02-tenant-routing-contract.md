# Tenant Routing Contract (Draft)

Date: 2026-07-27
Status: Draft for approval

## Purpose

Define exactly how requests resolve tenant context now (shared DB) and later (optional per-tenant DB files).

## Inputs

- Header: X-Club-Id
- Query param: club
- Auth context: user + memberships (+ super-admin flag)

## Resolution Order

1. If X-Club-Id present:
   - Try match by UUID/id first
   - Fallback to slug match
2. Else if club query param present:
   - Match by slug
3. Else:
   - If STRICT_TENANCY=true, reject with 400
   - Else fallback to DEFAULT_CLUB_SLUG

## Authorization Rules

- Super-admin bypasses membership check
- Authenticated non-super-admin must be member of resolved club
- Anonymous routes get USER-equivalent role for read-only behavior

## Output Context Contract

Resolved context injected into request pipeline:

- club.id
- club.slug
- club.role
- tenant.databaseKey

For Phase 1 (shared DB), tenant.databaseKey = "shared".
For Phase 2 (per-tenant files), tenant.databaseKey = deterministic file key.

## Error Contract

- 400: tenant identifier required in strict mode
- 404: club not found
- 403: authenticated user not a member of the resolved club

## Security Requirements

- Never trust X-Club-Id alone for authz
- Membership check must always use authenticated user id
- All mutating routes require both auth and role checks
- Log tenant resolution failures with request id

## Cache Key Contract

All cache keys remain club-scoped:

- rides:{clubId}:list:{...}
- rides:{clubId}:detail:{...}

Do not use global invalidation patterns in normal route handlers.

## Background Job Contract

Jobs that operate across clubs (archive/generate) must:

- Enumerate clubs from control-plane source
- Process one club at a time (or bounded concurrency)
- Emit per-club success/failure metrics
- Use idempotent operations where possible

## Database Resolver Contract (Abstraction)

Introduce a resolver API before DB split:

- getControlDb(): control-plane handle
- getTenantDb(clubId): tenant data handle

Phase 1 implementation can return the same shared handle for both.
This prevents route rewrites when/if moving to per-tenant files.

## Backward Compatibility Notes

- Existing X-Club-Id and ?club behavior is preserved
- Existing super-admin semantics are preserved
- Existing role gate behavior is preserved
