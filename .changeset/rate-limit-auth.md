---
"rides-api": patch
---

Add rate limiting and brute-force protection for better-auth email/password endpoints. Configures Redis-backed rate limiting at 5 attempts/minute for sign-in and 3 attempts/minute for sign-up. Includes failed login tracking with account lockout support. Auth0 JWT pathway remains unchanged.
