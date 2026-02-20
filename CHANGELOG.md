# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## 1.5.1 - 2026-02-20

### Updates

- Bumped minor dependencies

## 1.5.0 - 2026-02-20

### Added

- GitHub Actions cron workflow: generate repeating rides (1st of month, 02:00 UTC)
- GitHub Actions cron workflow: archive past rides (1st of month, 02:05 UTC)
- Both workflows support manual trigger via `workflow_dispatch`

## 1.4.0 - 2026-02-20

### Added

- Husky pre-commit hook enforcing `lint`, `check-types`, and `test`
- `CLAUDE.md` with architecture overview, commands, and commit/PR workflow

### Dependencies

- Added `husky@9.1.7` for git hooks

## 1.3.0 - 2026-02-20

### Added

- Graceful shutdown: SIGTERM/SIGINT handlers drain HTTP server, Redis, and DB pool
- Database index on `bcc_accounts.provider_account_id` for faster auth middleware lookups
- Composite database index on `bcc_rides (schedule_id, ride_date)` for cascade-delete queries

### Changed

- Explicit DB connection pool options: `max: 10`, `idle_timeout: 20s`, `max_lifetime: 1800s`
- Exported postgres client (`sqlClient`) from `src/db/index.ts` for shutdown access

### Migrations

- `0007_uneven_blur.sql`: creates the two new indexes

## 1.1.0 - 2026-02-14

### Added

- Avatar upload endpoint `POST /users/:id/avatar`
  - Accepts multipart/form-data with image files (PNG, JPG, GIF, WebP)
  - 4MB file size limit with validation
  - Automatic image processing using Sharp library
  - Generates two WebP versions: 40x40px thumbnail and 240x240px standard
  - Stores files in `public/avatars/` directory
  - Authorization: users can update own avatar, admins can update any
- Static file serving for `/avatars/*` route
- Database schema: added `imageLarge` column to `bcc_users` table
- Database migration: `0006_wandering_quentin_quire.sql`

### Dependencies

- Added `sharp@0.34.5` for image processing

### Technical Notes

- Avatar files named as: `{userId}-thumb.webp` (40px) and `{userId}.webp` (120px)
- Database stores relative paths: `/avatars/{userId}-thumb.webp` and `/avatars/{userId}.webp`
- Backwards compatible with existing Gravatar and Auth0 avatar URLs
