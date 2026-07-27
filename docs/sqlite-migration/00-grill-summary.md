# SQLite Migration - Initial Grill Summary

Date: 2026-07-27

## Executive Summary

Your current API is tightly coupled to Postgres. Migrating to SQLite is feasible, but this is an architectural migration, not a driver swap. The good news is current production risk is low because:

- Only one tenant exists today (BathCC)
- better-auth is not yet used by production tenants
- You are open to either one shared SQLite database or one database per tenant

This creates a strong window to simplify and de-risk before scaling to 100-1000 clubs.

## What Was Identified as Postgres-Coupled

- DB client is Postgres-specific in src/db/index.ts
- Drizzle schema uses pg-core types and features (pgEnum, uuid, jsonb)
- drizzle-kit config uses postgresql dialect
- better-auth adapter is configured with provider "pg"
- Archive route uses Postgres-only TO_TIMESTAMP raw SQL
- User search uses ilike

## Core Architecture Tension

The current app is built around a shared-database tenancy model:

- clubs, user_clubs, and role checks are central to authz
- club-scoped middleware assumes cross-tenant membership exists in one place
- multiple routes and background jobs assume shared visibility over all clubs

If you remove clubId from domain tables, you must redesign authz and routing assumptions, not just schema types.

## Updated Constraints (from your latest guidance)

- One DB per tenant is optional, not required
- Single shared SQLite DB is acceptable if it can scale to 100-1000 clubs
- Breaking changes are acceptable now due to low production footprint

## Initial Recommendation Shift

Given the updated constraints, start with:

1. Shared SQLite database
2. Keep clubId on tenant-scoped tables
3. Add a tenant-aware DB access abstraction now (so per-tenant DB can be adopted later without route rewrites)

This reduces complexity immediately while preserving a future path to per-tenant DB files.

## Business Constraint Added

- This migration must have a measurable cost benefit
- There must be no API or query speed regression
- Benchmark evidence is required before any production cutover

See 04-benchmark-and-cost-gate.md for acceptance thresholds and measurement method.

## Decision Points You Still Need to Lock

- Shared SQLite now vs immediate per-tenant SQLite
- Global identity model (shared users vs per-tenant users)
- Where tenant registry metadata lives
- Backup/restore SLOs before Litestream rollout
- Migration orchestration strategy across future tenant DB files

## Deliverables Created Alongside This Summary

- 01-target-architecture.md
- 02-tenant-routing-contract.md
- 03-migration-risk-register.md
- 04-benchmark-and-cost-gate.md
- 05-benchmark-harness-plan.md
- 06-sqlite-candidate-execution-checklist.md
- 07-local-benchmark-findings.md
