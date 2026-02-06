# Rides API

A Hono-based REST API for managing bike rides, built with TypeScript, Drizzle ORM, and PostgreSQL.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime
- **Framework**: [Hono](https://hono.dev) - Ultrafast web framework
- **Database**: PostgreSQL (via [Supabase](https://supabase.com))
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Cache**: Redis (npm redis client)
- **Auth**: Auth0 JWT tokens
- **Validation**: Zod
- **Process Manager**: PM2 (production)

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- PostgreSQL database (or Supabase account)
- Node.js (for TypeScript compilation only)

## Getting Started

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone and Install

```bash
git clone git@github.com:airburst/rides-api.git
cd rides-api
bun install
```

### 3. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Configure your environment variables:

```bash
# Database
DATABASE_URL=postgres://user:password@host:5432/database

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.your-app.com

# Server
PORT=3001
NODE_ENV=development

# API Key for cron jobs
API_KEY=your-secret-api-key

# RiderHQ (optional)
RIDERHQ_URL=https://www.riderhq.com
RIDERHQ_ACCOUNT_ID=
RIDERHQ_PRIVATE_KEY=

# Redis Cache (optional, recommended for production)
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
CACHE_TTL=300
```

### 4. Redis Setup (Optional)

**By default, caching is disabled in development** (`CACHE_ENABLED=false` in `.env.local`).

To test caching locally, start Redis with Docker:

```bash
bun run startredis
```

Then enable caching in `.env.local`:

```bash
CACHE_ENABLED=true
```

**Alternative: Install Redis locally**

```bash
# macOS
brew install redis && brew services start redis

# Linux
sudo apt install redis-server && sudo systemctl start redis-server
```

### 5. Database Setup

Run migrations:

```bash
bun run db:migrate
```

Optional - Seed database with test data:

```bash
bun run db:seed
```

### 6. Development

Start the development server with hot reload:

```bash
bun run dev
```

The API will be available at `http://localhost:3001`

## Available Scripts

### Development
- `bun run dev` - Start development server with hot reload
- `bun run startdb` - Start local PostgreSQL container
- `bun run startredis` - Start local Redis container (optional)
- `bun run test` - Run all tests
- `bun run lint` - Run ESLint with auto-fix
- `bun run format` - Format code with Prettier
- `bun run check-types` - TypeScript type checking

### Database
- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:migrate` - Run database migrations
- `bun run db:studio` - Open Drizzle Studio
- `bun run deploy` - Deploy to production VPS

## API Documentation

API test collection available in the `/bruno` folder. Import into [Bruno](https://www.usebruno.com/) to test all endpoints.

### Main Routes

- `GET /health` - Health check
- `GET /rides` - List rides
- `GET /rides/:id` - Get ride details
- `POST /rides` - Create ride (LEADER/ADMIN)
- `PUT /rides/:id` - Update ride (LEADER/ADMIN)
- `DELETE /rides/:id` - Delete ride (LEADER/ADMIN)
- `POST /rides/:id/join` - Join a ride
- `POST /rides/:id/leave` - Leave a ride
- `GET /users/me` - Get current user
- `GET /repeating-rides` - List repeating rides (ADMIN)
- `POST /generate` - Generate rides from templates (ADMIN/API_KEY)
- `POST /archive` - Archive old rides (API_KEY)
- `POST /riderhq` - Sync members from RiderHQ (API_KEY)

## Authentication

The API uses Auth0 JWT tokens for user authentication and API keys for automated endpoints.

- User endpoints: `Authorization: Bearer <jwt-token>`
- Cron endpoints: `Authorization: Bearer <api-key>`

## Deployment

This project uses GitHub Actions for automated deployment to a Ubuntu 24.04 VPS.

### Automatic Deployment

Merging to the `main` branch automatically triggers deployment:

1. CI runs linting and type checking
2. On success, code is deployed to production VPS
3. Migrations run automatically
4. PM2 gracefully reloads the application

### Manual Deployment

```bash
bun run deploy
```

This SSHs into the VPS and runs the deployment commands.

### Redis Setup on VPS

On the production server, run the setup script:

```bash
cd ~/rides-api
./bin/setup-redis.sh
```

Then follow the instructions to set a Redis password and update the production `.env` file.

**Important**: Make sure to add these environment variables to production:

```bash
REDIS_URL=redis://:YOUR_STRONG_PASSWORD@localhost:6379
CACHE_ENABLED=true
CACHE_TTL=300
```

After updating `.env`, reload the API:

```bash
pm2 reload ecosystem.config.cjs
```

### Cache Performance

With Redis caching enabled:
- **GET /rides**: ~90% faster (100-500ms → 5-10ms cached)
- **GET /rides/:id**: ~95% faster (50-200ms → 2-5ms cached)
- Target cache hit rate: >80%

Cache invalidation is automatic on all ride mutations (create, update, delete, join, leave, cancel).

## Development with Bun

### Why Bun?

- **Fast**: 20-100x faster than npm for package installation
- **Native TypeScript**: Runs `.ts` files directly without transpilation
- **All-in-one**: Runtime, package manager, bundler, and test runner
- **Drop-in replacement**: Works with existing npm packages

### Key Differences from Node.js

- Use `bun` instead of `node` to run scripts
- No need for `tsx` or `ts-node` - Bun runs TypeScript natively
- `bun install` instead of `npm install`
- Built-in watch mode: `bun --watch script.ts`

## Project Structure

```
rides-api/
├── src/
│   ├── index.ts              # Application entry point
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   ├── schema/           # Drizzle schema definitions
│   │   ├── pump.ts           # Data migration script
│   │   └── seed.ts           # Test data seeding
│   ├── routes/               # API route handlers
│   │   ├── rides.ts
│   │   ├── users.ts
│   │   ├── repeating-rides.ts
│   │   ├── generate.ts
│   │   ├── archive.ts
│   │   └── riderhq.ts
│   ├── middleware/           # Auth middleware
│   └── lib/                  # Utilities
├── bruno/                    # API test collection
├── drizzle/                  # Database migrations
├── .github/workflows/        # CI/CD workflows
└── bin/                      # Helper scripts
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Ensure linting and type-checking pass: `bun run check`
4. Push to GitHub - CI will run automatically
5. Create a Pull Request
6. Merge to `main` triggers automatic deployment

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
