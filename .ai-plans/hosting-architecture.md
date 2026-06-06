# Hosting Architecture Decision

**Decision Date:** 2026-06-06  
**Status:** Approved  
**Current Scale:** ~400 users/club → **Target Scale:** 1500 clubs × 100 members (~150K users)

## Selected Architecture: Option C

### Components

1. **API Server**: Bun + Hono on Oracle Cloud VPS
   - Runs better-auth for email/password authentication
   - Deployed via PM2
   - No Auth0 changes (JWT verification middleware unchanged)

2. **Database**: Supabase PostgreSQL (DB-only)
   - No Supabase Auth used
   - Handles all multi-tenant data (rides, clubs, memberships, etc.)
   - Drizzle ORM for query abstraction

3. **Cache**: Redis instance (reused for query caching)
   - Rate limiting storage for better-auth
   - Failed login tracking with account lockout
   - Ride list/detail caching (club-scoped)

4. **Email**: Resend API
   - Verification emails from better-auth
   - Password reset emails
   - Cost scales with usage

5. **Frontend (Rides App SPA)**: Static assets
   - Built as JavaScript bundle (Next.js / React)
   - **Phase 1 (Current)**: Served from VPS `/public` directory (simple, low cost)
   - **Phase 2 (If scale requires)**: Cloudflare R2 + Cloudflare CDN (global edge caching, better performance)
   - Deployment: GitHub Actions builds SPA → pushes to VPS or R2

### Estimated Monthly Costs (~150K users)

- **Supabase**: $100 (DB-only, no auth overages)
- **VPS (Oracle Cloud)**: $60–100 (2GB+ RAM, 50GB storage)
- **Redis**: $50–80 (10–30GB instance)
- **Resend**: $20–50 (email usage varies)
- **Domain/DNS**: ~$20–30
- **Total**: **~$330–360/month**

## Rationale

### Why Option C over Supabase Auth?

- **Cost**: Supabase Auth pricing ($25/mo base + $0.00325/MAU) becomes expensive at 150K users (~$488/mo)
- **Control**: Self-hosted better-auth on VPS allows full customization (failed login tracking, account lockout, future features)
- **Simplicity**: Better-auth is lightweight, single-package solution
- **Multi-tenancy**: Existing user_clubs schema handles scoping perfectly

### Why VPS + Redis + Supabase DB?

- **Flexibility**: VPS runs app code + caching layer; Supabase is pure DB
- **Cost Efficiency**: VPS is cheaper than serverless at this scale
- **Cache Reuse**: Single Redis instance for both query caching + rate limiting
- **Zero Migration**: Existing Drizzle schema works unchanged
- **Redundancy**: Can run multiple app instances on VPS with shared DB/cache

## Security Hardening (This Sprint)

- Rate limiting: 5 attempts/min (sign-in), 3 attempts/min (sign-up)
- Failed login tracking with account lockout (5 attempts → 15 min lock)
- All gated on Redis availability; fails open if Redis unavailable
- Auth0 JWT pathway completely unaffected

## Frontend Deployment Strategy

### Phase 1: VPS-Hosted (Current)

- Build SPA via GitHub Actions: `npm run build` or equivalent
- Push compiled assets to VPS `/public` directory via SSH
- Serve via Hono's `serveStatic({ root: "./public" })` middleware
- **Pros**: Simple, no additional costs, single deployment target
- **Cons**: All traffic goes through VPS, no global caching

### Phase 2: R2 + Cloudflare CDN (If Scale Requires)

- Build SPA in GitHub Actions
- Upload assets to Cloudflare R2 (S3-compatible object storage)
- Serve via Cloudflare CDN with edge caching
- API remains on VPS (different origin)
- **Pros**: Global CDN edge caching, lower VPS bandwidth, better performance for distant users
- **Cons**: ~$0.10 per GB stored + $0.20 per 1M read requests (negligible at typical SPA scale)

### Typical GitHub Actions Workflow

```yaml
# Build SPA, run tests, deploy to VPS
- name: Build frontend
  run: npm run build

- name: Deploy to VPS
  uses: appleboy/ssh-action@master
  with:
    host: ${{ secrets.VPS_HOST }}
    username: ${{ secrets.VPS_USER }}
    key: ${{ secrets.VPS_SSH_KEY }}
    script: |
      cd /opt/rides-app
      rsync -av dist/ public/
      pm2 restart rides-api
```

### CDN Configuration (Future)

When scaling to R2:
1. Create Cloudflare page rule: `example.com/app/*` → cache everything
2. Set TTL: 1 year for versioned assets (with content hashing), 5 min for index.html
3. API requests (to `/api/*`) bypass cache, go directly to VPS origin

## Push Notifications (Web + Future Mobile)

### Web App (Current Phase)

- Web Push API via Service Workers
- Free via Firebase Cloud Messaging (FCM) + browser support
- Typical implementation: notify riders of new/cancelled rides, reminders
- Expected volume: 150K users × 2 msgs/week = 43K msgs/day (well under FCM's 1M/day free tier)

### Native/Hybrid Mobile App (Future Phase - Not Critical)

**Business case:**
- Primary benefit: offline access to rider contact data (names, phone, email)
- Secondary: better push notification delivery than web
- Optional: GPS tracking if needed later

**If/when pursued:**
- WebView hybrid approach (native shell + web SPA): 1.5x dev cost of web-only, enables fast web updates + app store presence
- Push: Firebase FCM (free) + Apple APNs (free, $99/year dev account)
- Estimated delivery: Phase 3 or later (after scaling web to 150K users)
- Cost at scale: ~$100/year for Apple dev account + Firebase free tier

## Future Considerations

- **Scaling beyond 150K**: Multi-instance Hono with load balancer + shared Redis/DB
- **Frontend at scale**: Switch to R2 + Cloudflare CDN once SPA traffic becomes significant
- **Mobile app**: WebView hybrid (Phase 3+) for offline contact data + app store presence if needed
- **Monitoring**: Grafana board for rate limit, failed login, and API latency metrics
- **Disaster Recovery**: Database backups via Supabase; code/cache recoverable from git
- **DNS**: Cloudflare as authoritative DNS (optional, but useful for CDN integration)

## Deployment Target

- **API**: Oracle Cloud VPS (current deployment)
- **VPS Alternative**: Any Linux with Bun support (AWS EC2, DigitalOcean, Linode, etc.)
- **CI/CD Pipeline**: 
  - GitHub Actions builds both API (Bun) and frontend SPA
  - Secrets for VPS SSH, R2 credentials (future)
  - Deploy API to VPS via SSH + PM2 restart
  - Deploy frontend to VPS `/public` (phase 1) or R2 (phase 2)
