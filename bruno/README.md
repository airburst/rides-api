# Rides API - Bruno Test Collection

This directory contains the Bruno API test collection for the Rides API.

## Overview

The collection is organized into the following folders:

### Health

- **Health Check** - Simple health check endpoint (no auth required)

### Rides (11 requests)

- **List Rides** - Get rides within a date range (optional auth)
- **Get Ride** - Get a specific ride with participant details (optional auth)
- **Create Ride** - Create a new ride (LEADER/ADMIN only)
- **Update Ride** - Update an existing ride (LEADER/ADMIN only)
- **Delete Ride** - Soft delete a ride (LEADER/ADMIN only)
- **Cancel Ride** - Mark a ride as cancelled (LEADER/ADMIN only)
- **Uncancel Ride** - Uncancel a ride (LEADER/ADMIN only)
- **Join Ride** - Join a ride as current user
- **Join Ride as Leader** - Join another user to a ride (LEADER/ADMIN only)
- **Leave Ride** - Leave a ride as current user
- **Leave Ride as Leader** - Remove another user from a ride (LEADER/ADMIN only)
- **Update Notes** - Update ride notes for current user or another user (LEADER/ADMIN)

### Users (4 requests)

- **Get Current User** - Get authenticated user's profile
- **List Users** - List all users with optional search (ADMIN only)
- **Get User** - Get a specific user (self or ADMIN)
- **Update User** - Update user profile (self or ADMIN)

### Repeating Rides (5 requests)

- **List Repeating Rides** - List all repeating ride templates (ADMIN only)
- **Get Repeating Ride** - Get a specific template (ADMIN only)
- **Create Repeating Ride** - Create a new template (ADMIN only)
- **Update Repeating Ride** - Update a template (ADMIN only)
- **Delete Repeating Ride** - Delete a template with optional cascade (ADMIN only)

### Generate (2 requests)

- **Generate Rides** - Generate rides from templates (ADMIN or API_KEY)
- **Generate Rides (API Key)** - Same with API key authentication for cron jobs

### Archive (1 request)

- **Archive Rides** - Archive old rides (API_KEY only)

### RiderHQ (1 request)

- **Sync Members** - Sync member data from RiderHQ (API_KEY only)

## Environments

### Local

- **baseUrl**: `http://localhost:3001`
- **accessToken**: Your JWT token from Auth0
- **apiKey**: Your API key for cron job endpoints

### Production

- **baseUrl**: `https://api.fairhursts.net`
- **accessToken**: Your JWT token from Auth0
- **apiKey**: Your API key for cron job endpoints

## Authentication

The API uses two authentication methods:

1. **Bearer Token (JWT)** - For user-authenticated requests
   - Obtained from Auth0
   - Set in the `accessToken` environment variable
   - Automatically included via collection-level auth inheritance

2. **API Key** - For automated/cron job requests
   - Set in the `apiKey` environment variable
   - Used for `/generate`, `/archive`, and `/riderhq` endpoints
   - Sent as `Authorization: Bearer <apiKey>`

## Getting Started

1. Set your environment variables in `environments/local.bru` or `environments/production.bru`
2. Get a JWT token from Auth0 and set it as `accessToken`
3. If testing cron endpoints, get your API key and set it as `apiKey`
4. Select the appropriate environment in Bruno
5. Run the requests!

## Role Requirements

- **USER**: Can view rides, join/leave rides, update own profile
- **LEADER**: All USER permissions + can create/update/delete rides, manage ride participants
- **ADMIN**: All LEADER permissions + can manage users, repeating rides, and system settings

## Notes

- Most ride and user operations require authentication
- Some endpoints like "List Rides" and "Get Ride" work with optional authentication
- CRUD operations on rides, repeating rides, and users have role-based access control
- Background job endpoints (`/generate`, `/archive`, `/riderhq`) use API key authentication
