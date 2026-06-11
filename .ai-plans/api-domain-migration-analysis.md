# API Domain Migration Analysis

## Goal

Migrate API hostname from `api.fairhursts.net` to `api.clubrides.app`, while preserving service continuity and preparing frontend hosting changes after DNS authority is moved away from Vercel-managed nameservers.

## Context You Provided

- DNS is currently delegated to Vercel nameservers.
- You plan to move DNS authority back so you can add/manage `api` and `admin` subdomains directly.
- Once DNS is no longer Vercel-managed, current Vercel wildcard routing behavior for the SPA will no longer be available.
- SPA will need rehosting.

## Executive Summary

This migration should be done in two coordinated tracks:

1. API domain cutover (`api.fairhursts.net` -> `api.clubrides.app`) with a dual-domain overlap window.
2. Frontend/domain hosting migration away from Vercel wildcard dependency.

Do not perform a hard switch. Keep both API domains active temporarily, then migrate clients and auth settings, then deprecate the old domain.

## Impact Inventory (This Repo)

### Code/config directly tied to domain behavior

- `src/lib/origins.ts`
  - Contains explicit origin allowlist and wildcard domain handling.
- `src/lib/auth.ts`
  - Better Auth base URL and trusted origins behavior depend on env values.
- `src/lib/env.ts`
  - Required env vars include `BETTER_AUTH_URL`, `AUTH0_AUDIENCE`, `COOKIE_DOMAIN`.

### Environment and ops references

- `.env` (local/dev reference values currently include `BETTER_AUTH_URL=https://api.fairhursts.net`, `COOKIE_DOMAIN=fairhursts.net`)
- `.env.example`
- `.github/workflows/deploy.yml`
  - Current health check uses `http://$VPS_HOST:3001/health` (direct host/port; may remain as-is or move to domain-based check later).
- `ecosystem.config.mjs`
  - PM2 runtime config, no direct domain value but part of deployment/runtime path.

### API client/testing docs and tools

- `bruno/environments/production.bru`
  - `baseUrl: https://api.fairhursts.net`
  - callback URL currently references old frontend domain.
- `bruno/README.md`
  - production base URL references old API domain.
- `scripts/send-password-resets.ts`
  - hardcoded app URL currently points at `app.fairhursts.net` path.
- `docs/architecture.html`
  - references old frontend/domain topology.

## Cross-Repo / External Dependencies (Expected)

These are likely outside this repo but must be migrated in lockstep:

- Frontend app(s): `VITE_API_URL` and auth callback/origin settings.
- Admin app domain (`admin.clubrides.app`) hosting and env.
- Auth0 tenant application settings (Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins).
- Better Auth URL/cookie domain settings in deployed env.
- Caddy/site config and certificates for new hostnames.
- DNS records and nameserver delegation.

## Migration Strategy

### Phase 0: Preflight

1. Lower DNS TTL for relevant records (old and planned new hostnames).
2. Add `api.clubrides.app` in reverse proxy and certificate automation.
3. Validate API serves both hostnames before client changes.

### Phase 1: Dual-domain API

1. Keep `api.fairhursts.net` live.
2. Bring up `api.clubrides.app` to same backend.
3. Add/verify CORS/trusted-origin coverage for all expected frontend origins.
4. Set `BETTER_AUTH_URL` strategy:
   - Preferred: move to `https://api.clubrides.app` once frontend clients are updated.
   - During overlap: verify any auth-generated URLs are acceptable for both domain paths.

### Phase 2: Frontend and auth migration

1. Update SPA hosting platform (post-Vercel-DNS delegation move).
2. Update frontend env `VITE_API_URL` to `https://api.clubrides.app`.
3. Update Auth0 allowed origins/callback/logout for new frontend/admin domains.
4. Validate Better Auth cookie behavior with new registrable domain (`clubrides.app`).

### Phase 3: Stabilization and deprecation

1. Monitor traffic split old/new API hostnames.
2. Migrate remaining tools (Bruno configs, scripts, docs).
3. Remove old domain references and optionally redirect old API host.
4. Announce cutoff date, then retire `api.fairhursts.net`.

## DNS and Hosting Notes

- Moving nameserver authority off Vercel is a control-plane change with broad blast radius.
- Plan DNS cutover separately from app cutover when possible.
- Wildcard subdomain behavior for SPA that depended on Vercel setup should be reimplemented at the new edge/proxy layer.
- If wildcard tenant routing is required (`*.clubrides.app`), ensure:
  - wildcard DNS record(s),
  - wildcard certificate,
  - routing logic by host/subdomain,
  - CORS and auth provider origin/callback coverage.

## Risks and Mitigations

### Risk: Auth flow breakage (Auth0)

- Mitigation: pre-register all new callback/logout/web origins before user-facing switch.

### Risk: Better Auth links/cookies tied to old domain

- Mitigation: change `BETTER_AUTH_URL` and `COOKIE_DOMAIN` with staged validation.

### Risk: CORS regressions on tenant subdomains

- Mitigation: automated preflight tests for representative origins before and after deploy.

### Risk: DNS propagation/partial traffic split

- Mitigation: dual-domain overlap + low TTL + health checks on both hosts.

### Risk: stale server working tree causing deploy failures

- Mitigation: workflow already includes cleanup for stale untracked ecosystem config files before `git pull`.

## Recommended Ordered Checklist

1. Add `api.clubrides.app` DNS + proxy + cert.
2. Confirm API health on new hostname.
3. Add Auth0 settings for planned frontend/admin domains.
4. Update frontend hosting and env to use `api.clubrides.app`.
5. Update API env (`BETTER_AUTH_URL`, `COOKIE_DOMAIN`) and redeploy.
6. Validate login/session/CORS from representative tenant domains.
7. Update Bruno/docs/scripts hardcoded hostnames.
8. Monitor and deprecate old API hostname.

## Validation Matrix (Must Pass)

- Preflight from tenant SPA origin to `/api/auth/get-session` includes `Access-Control-Allow-Origin`.
- Better Auth sign-in, session retrieval, logout.
- Auth0 login callback/logout on new frontend domains.
- Standard API read/write calls from SPA and admin.
- Deployment health checks + PM2 process stable after reload.

## Open Decisions

1. Whether to keep deploy workflow health check as host:port or change to domain endpoint.
2. Final cookie domain policy (`clubrides.app` vs narrower scope).
3. Whether old API host will redirect, proxy, or be hard-retired.
4. Target platform for SPA rehosting and wildcard tenant strategy implementation.
