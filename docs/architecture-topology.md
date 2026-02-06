# Architecture Topology

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT STATE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌─────────────────────────────────────┐     ┌──────────────┐
│          │     │           Vercel                     │     │              │
│  Browser │────▶│  ┌─────────────────────────────┐    │────▶│   Supabase   │
│          │     │  │   Next.js App               │    │     │   Postgres   │
└──────────┘     │  │                             │    │     │              │
                 │  │  ┌───────────────────────┐  │    │     └──────────────┘
                 │  │  │  Server Components    │  │    │
                 │  │  │  (RSC)                │  │    │
                 │  │  │  • Page renders       │  │    │
                 │  │  │  • Data fetching      │  │    │
                 │  │  └───────────────────────┘  │    │
                 │  │                             │    │
                 │  │  ┌───────────────────────┐  │    │
                 │  │  │  Server Actions       │  │    │
                 │  │  │  • getRides()         │  │    │
                 │  │  │  • joinRide()         │  │    │
                 │  │  │  • leaveRide()        │  │    │
                 │  │  │  • etc.               │  │    │
                 │  │  └───────────────────────┘  │    │
                 │  │                             │    │
                 │  │  ┌───────────────────────┐  │    │
                 │  │  │  NextAuth             │  │    │     ┌──────────────┐
                 │  │  │  • Session DB lookup  │──┼────┼────▶│    Auth0     │
                 │  │  │  • Cookie handling    │  │    │     │   (IdP)      │
                 │  │  └───────────────────────┘  │    │     └──────────────┘
                 │  │                             │    │
                 │  └─────────────────────────────┘    │
                 │                                     │
                 │  ════════════════════════════════   │
                 │  Each request = Serverless Function │
                 │  100K/month limit (Hobby plan)      │
                 └─────────────────────────────────────┘

State Management:
┌──────────────────────────────────────────────────┐
│  Client (Browser)                                │
│  ┌────────────┐    ┌─────────────────────────┐  │
│  │   Jotai    │◀──▶│  Optimistic Updates     │  │
│  │   Atoms    │    │  • Join/Leave tracking  │  │
│  └────────────┘    │  • Rider count updates  │  │
│                    └─────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Data Flow (Current)

```
Page Load:
──────────
Browser ──GET /──▶ Vercel ──▶ Server Component ──▶ getServerAuthSession()
                                    │                      │
                                    │              ┌───────▼───────┐
                                    │              │ DB: sessions  │
                                    │              │ table lookup  │
                                    │              └───────────────┘
                                    │
                                    ▼
                              getRides() ──▶ DB: rides table
                                    │
                                    ▼
                              Render HTML
                                    │
                                    ▼
                              Return to Browser


Join Ride:
──────────
Browser ──▶ Jotai (optimistic) ──▶ joinRide() Server Action
                                        │
                                        ▼
                                  canUseAction()
                                        │
                                        ▼
                                  getServerAuthSession()
                                        │
                                        ▼
                                  DB: Insert user_on_rides
                                        │
                                        ▼
                                  Return success/error
```

---

## Future Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FUTURE STATE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌────────────────────┐     ┌────────────────────────────────┐
│          │     │      Vercel        │     │        Oracle Cloud            │
│  Browser │────▶│   (Static CDN)     │     │     (Always Free VM)           │
│          │     │                    │     │                                │
└──────────┘     │  ┌──────────────┐  │     │  ┌──────────────────────────┐  │
     │           │  │ Next.js App  │  │     │  │      Hono API            │  │
     │           │  │ (CSR/Static) │  │     │  │                          │  │
     │           │  │              │  │     │  │  ┌────────────────────┐  │  │
     │           │  │ • HTML/JS/CSS│  │     │  │  │  Routes            │  │  │
     │           │  │ • No SSR     │  │     │  │  │  • GET /rides      │  │  │
     │           │  │ • No funcs   │  │     │  │  │  • GET /rides/:id  │  │  │
     │           │  └──────────────┘  │     │  │  │  • POST /join      │  │  │
     │           │                    │     │  │  │  • POST /leave     │  │  │
     │           └────────────────────┘     │  │  │  • etc.            │  │  │
     │                                      │  │  └────────────────────┘  │  │
     │                                      │  │                          │  │
     │           ┌─────────────────────┐    │  │  ┌────────────────────┐  │  │
     └──────────▶│   API Requests      │───▶│  │  │  Auth Middleware   │  │  │
                 │   (with JWT)        │    │  │  │  • Verify JWT      │  │  │
                 └─────────────────────┘    │  │  │  • JWKS validation │  │  │
                                            │  │  │  • User lookup     │  │  │
                                            │  │  └────────────────────┘  │  │
                                            │  │                          │  │
                                            │  │  ┌────────────────────┐  │  │
                                            │  │  │  Drizzle ORM       │  │  │
                                            │  │  │  (same schema)     │  │  │
                                            │  │  └─────────┬──────────┘  │  │
                                            │  │            │             │  │
                                            │  └────────────┼─────────────┘  │
                                            │               │                │
                                            └───────────────┼────────────────┘
                                                            │
     ┌──────────────┐                                       │
     │    Auth0     │◀──────── JWT Verification ────────────┤
     │    (IdP)     │                                       │
     └──────────────┘                                       ▼
                                                    ┌──────────────┐
                                                    │   Supabase   │
                                                    │   Postgres   │
                                                    └──────────────┘

State Management:
┌──────────────────────────────────────────────────────────────────┐
│  Client (Browser)                                                │
│  ┌──────────────────┐    ┌─────────────────────────────────────┐│
│  │  TanStack Query  │◀──▶│  Optimistic Updates                 ││
│  │  • Query cache   │    │  • onMutate: update cache           ││
│  │  • Mutations     │    │  • onError: rollback                ││
│  │  • Auto refetch  │    │  • onSettled: invalidate            ││
│  └──────────────────┘    └─────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  Auth0 SPA SDK   │                                           │
│  │  • Token mgmt    │                                           │
│  │  • Silent auth   │                                           │
│  └──────────────────┘                                           │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow (Future)

```
Page Load:
──────────
Browser ──GET /──▶ Vercel CDN ──▶ Static HTML/JS
                                       │
                                       ▼
                              TanStack Query: useRides()
                                       │
                                       ▼
                              Auth0 SDK: getAccessTokenSilently()
                                       │
                                       ▼
              Oracle Cloud ◀── GET /rides (+ Bearer token)
                   │
                   ▼
             Verify JWT (JWKS)
                   │
                   ▼
             Query DB: rides
                   │
                   ▼
             Return JSON ──▶ Browser ──▶ Render


Join Ride:
──────────
Browser ──▶ useMutation.mutate()
                   │
         ┌────────┴────────┐
         ▼                 ▼
   onMutate:          mutationFn:
   Update cache       POST /rides/:id/join
   optimistically          │
         │                 ▼
         │           Oracle Cloud
         │                 │
         │           Verify JWT
         │                 │
         │           Check role
         │                 │
         │           Insert DB
         │                 │
         └────────┬────────┘
                  ▼
            onSettled:
            Invalidate queries
            (refetch in background)
```

---

## Network Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NETWORK DIAGRAM                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │  Internet   │
                              └──────┬──────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
            ▼                        ▼                        ▼
   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
   │   Vercel CDN    │     │  Oracle Cloud   │     │     Auth0       │
   │                 │     │                 │     │                 │
   │  Region: Global │     │  Region: UK     │     │  Region: EU     │
   │  (Edge)         │     │  (London)       │     │                 │
   │                 │     │                 │     │                 │
   │  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
   │  │ Static    │  │     │  │ VM        │  │     │  │ Identity  │  │
   │  │ Assets    │  │     │  │           │  │     │  │ Provider  │  │
   │  │           │  │     │  │ Public IP │  │     │  │           │  │
   │  │ HTML/JS   │  │     │  │ :443      │  │     │  │ JWKS      │  │
   │  │ CSS/IMG   │  │     │  │           │  │     │  │ Tokens    │  │
   │  └───────────┘  │     │  │ ┌───────┐ │  │     │  └───────────┘  │
   │                 │     │  │ │ Caddy │ │  │     │                 │
   └─────────────────┘     │  │ │ :443  │ │  │     └─────────────────┘
                           │  │ └───┬───┘ │  │
                           │  │     │     │  │
                           │  │ ┌───▼───┐ │  │
                           │  │ │ Hono  │ │  │
                           │  │ │ :3001 │ │  │
                           │  │ └───┬───┘ │  │
                           │  │     │     │  │
                           │  └─────┼─────┘  │
                           │        │        │
                           └────────┼────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │    Supabase     │
                           │    Postgres     │
                           │                 │
                           │  Region: EU     │
                           │  (your region)  │
                           └─────────────────┘
```

---

## Oracle Cloud VM Details

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORACLE CLOUD VM SETUP                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Oracle Cloud Infrastructure (OCI)                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Virtual Cloud Network (VCN)                              │ │
│  │  CIDR: 10.0.0.0/16                                        │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  Public Subnet                                      │ │ │
│  │  │  CIDR: 10.0.0.0/24                                  │ │ │
│  │  │                                                     │ │ │
│  │  │  ┌───────────────────────────────────────────────┐ │ │ │
│  │  │  │  VM.Standard.E2.1.Micro (Always Free)         │ │ │ │
│  │  │  │                                               │ │ │ │
│  │  │  │  • 1 OCPU (AMD EPYC)                          │ │ │ │
│  │  │  │  • 1 GB RAM                                   │ │ │ │
│  │  │  │  • 50 GB Boot Volume                          │ │ │ │
│  │  │  │  • Public IP: <assigned>                      │ │ │ │
│  │  │  │                                               │ │ │ │
│  │  │  │  ┌─────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │  OS: Oracle Linux 8 / Ubuntu 22.04      │ │ │ │ │
│  │  │  │  │                                         │ │ │ │ │
│  │  │  │  │  Services:                              │ │ │ │ │
│  │  │  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐ │ │ │ │ │
│  │  │  │  │  │  Caddy  │  │  Hono   │  │   PM2   │ │ │ │ │ │
│  │  │  │  │  │  :443   │─▶│  :3001  │◀─│ Manager │ │ │ │ │ │
│  │  │  │  │  └─────────┘  └─────────┘  └─────────┘ │ │ │ │ │
│  │  │  │  │                                         │ │ │ │ │
│  │  │  │  └─────────────────────────────────────────┘ │ │ │ │
│  │  │  │                                               │ │ │ │
│  │  │  └───────────────────────────────────────────────┘ │ │ │
│  │  │                                                     │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  Security List (Ingress Rules)                      │ │ │
│  │  │                                                     │ │ │
│  │  │  Source        Protocol   Port   Description        │ │ │
│  │  │  ───────────   ────────   ────   ───────────        │ │ │
│  │  │  0.0.0.0/0     TCP        22     SSH                │ │ │
│  │  │  0.0.0.0/0     TCP        443    HTTPS (Caddy)      │ │ │
│  │  │  0.0.0.0/0     TCP        80     HTTP (redirect)    │ │ │
│  │  │                                                     │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Phases Visual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MIGRATION TIMELINE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 0          Phase 1              Phase 2-4            Phase 5
Auth0 Setup      API Foundation       Feature Migration    Cleanup
   │                  │                    │                  │
   ▼                  ▼                    ▼                  ▼
┌──────┐         ┌──────────┐         ┌──────────┐       ┌──────────┐
│Create│         │ Oracle   │         │ Per-     │       │ Remove   │
│SPA   │────────▶│ Cloud VM │────────▶│ Feature  │──────▶│ Old Code │
│App   │         │ + Hono   │         │ Cutover  │       │          │
└──────┘         └──────────┘         └──────────┘       └──────────┘
                                            │
                      ┌─────────────────────┼─────────────────────┐
                      │                     │                     │
                      ▼                     ▼                     ▼
                 ┌─────────┐          ┌─────────┐          ┌─────────┐
                 │Feature 1│          │Feature 2│          │Feature N│
                 │Rides    │          │Join/    │          │Profile  │
                 │List     │          │Leave    │          │etc.     │
                 └─────────┘          └─────────┘          └─────────┘
                      │                     │                     │
                      ▼                     ▼                     ▼
              ┌─────────────────────────────────────────────────────┐
              │                COEXISTENCE PERIOD                   │
              │                                                     │
              │   Old System          │          New System         │
              │   ────────────        │          ──────────         │
              │   Server Actions      │          Hono API           │
              │   NextAuth            │          Auth0 SPA          │
              │   Jotai               │          TanStack Query     │
              │                       │                             │
              │   (Gradually shrinks) │   (Gradually grows)         │
              └─────────────────────────────────────────────────────┘
```

---

## Component Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT TRANSFORMATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

CURRENT                                    FUTURE
───────                                    ──────

┌─────────────────────┐                   ┌─────────────────────┐
│ Server Component    │                   │ Client Component    │
│ RidesList           │         ──▶       │ RidesList           │
│ • async             │                   │ • 'use client'      │
│ • getServerSession  │                   │ • useRides()        │
│ • getRides()        │                   │ • useAuth0()        │
└─────────────────────┘                   └─────────────────────┘

┌─────────────────────┐                   ┌─────────────────────┐
│ Server Action       │                   │ API Endpoint        │
│ joinRide()          │         ──▶       │ POST /rides/:id/join│
│ • "use server"      │                   │ • Hono route        │
│ • canUseAction()    │                   │ • authMiddleware    │
│ • db.insert()       │                   │ • db.insert()       │
└─────────────────────┘                   └─────────────────────┘

┌─────────────────────┐                   ┌─────────────────────┐
│ Jotai Atom          │                   │ TanStack Mutation   │
│ optimisticUpdates   │         ──▶       │ useJoinRide()       │
│ • manual state      │                   │ • onMutate          │
│ • manual cleanup    │                   │ • onError rollback  │
└─────────────────────┘                   └─────────────────────┘

┌─────────────────────┐                   ┌─────────────────────┐
│ NextAuth            │                   │ Auth0 SPA SDK       │
│ • Session DB lookup │         ──▶       │ • JWT in memory     │
│ • Cookie-based      │                   │ • No DB lookup      │
│ • Server-side       │                   │ • Client-side       │
└─────────────────────┘                   └─────────────────────┘
```
