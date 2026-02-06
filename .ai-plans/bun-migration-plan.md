# Migration Plan: NPM to Bun + GitHub Actions CI/CD

## Problem Statement

The rides-api repository currently uses npm for package management and manual SSH deployment. We want to:
1. Migrate to Bun for faster development and deployment
2. Implement automated CI/CD via GitHub Actions
3. Deploy to Ubuntu 24.04 VPS on merge to main

## Analysis & Recommendation

### ✅ Is Bun Migration a Good Idea?

**YES** - This is an excellent decision for this project:

**Pros:**
- **Speed**: 20-100x faster than npm for installs
- **TypeScript Native**: No need for tsx, runs .ts files directly
- **Drop-in Replacement**: Works with existing npm packages
- **Single Binary**: Simpler deployment, no separate Node.js needed
- **Built-in Tools**: Bundler, test runner, package manager in one
- **Production Ready**: Bun 1.0+ is stable for production use
- **Smaller Footprint**: Single ~90MB binary vs Node.js + npm

**Cons:**
- **Ecosystem Maturity**: Some npm packages may have edge cases
- **Team Familiarity**: Team may need to learn Bun-specific features

**Compatibility Check:**
- ✅ All dependencies are pure JavaScript/TypeScript (no native bindings)
- ✅ Hono framework explicitly supports Bun
- ✅ drizzle-orm works perfectly with Bun
- ✅ PostgreSQL driver is compatible
- ⚠️ **Note**: `tsx` dev dependency becomes unnecessary (Bun runs .ts natively)

### Project Structure Assessment

**Current State:**
- Manual deployment via SSH + PM2
- No CI/CD pipeline
- npm for package management
- Ubuntu 24.04 VPS target
- External Supabase database

**Target State:**
- Bun for package management and runtime
- GitHub Actions for CI/CD
- Automated deployment on merge to main
- Linting/type-checking in CI
- Zero-downtime deployments with PM2

## Implementation Plan

### Phase 1: Local Bun Migration (30 minutes)
**Goal:** Convert local development to use Bun

- [ ] Install Bun on local machine (already done: v1.3.6)
- [ ] Remove npm artifacts
  - [ ] Delete `package-lock.json`
  - [ ] Delete `node_modules/`
- [ ] Initialize Bun
  - [ ] Run `bun install` to generate `bun.lockb`
  - [ ] Verify all dependencies install correctly
- [ ] Update package.json scripts
  - [ ] Replace `tsx` usage with `bun` runtime
  - [ ] Update dev script: `bun --watch src/index.ts`
  - [ ] Update db scripts to use `bun` instead of `tsx`
  - [ ] Keep `tsc` for type checking (Bun doesn't type-check)
- [ ] Update .gitignore
  - [ ] Add `bun.lockb` (should be committed)
  - [ ] Remove `package-lock.json` reference
- [ ] Test locally
  - [ ] Run `bun run dev` - verify hot reload works
  - [ ] Run `bun run build` - verify TypeScript compilation
  - [ ] Run `bun run lint` - verify linting works
  - [ ] Run `bun run check-types` - verify type checking
  - [ ] Test database migrations with `bun run db:migrate`
- [ ] Update documentation
  - [ ] Add README section about Bun requirement
  - [ ] Document installation: `curl -fsSL https://bun.sh/install | bash`

### Phase 2: VPS Setup (20 minutes)
**Goal:** Prepare Ubuntu 24.04 VPS for Bun deployments

- [ ] SSH into VPS: `ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53`
- [ ] Install Bun on VPS
  - [ ] Run: `curl -fsSL https://bun.sh/install | bash`
  - [ ] Add to PATH: `echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc`
  - [ ] Reload: `source ~/.bashrc`
  - [ ] Verify: `bun --version`
- [ ] Update PM2 ecosystem file (if exists) or create one
  - [ ] Create `ecosystem.config.js` in project root
  - [ ] Configure to use `bun` instead of `node`
  - [ ] Set environment to production
- [ ] Test manual deployment with Bun
  - [ ] Navigate to `~/rides-api`
  - [ ] Run: `git pull`
  - [ ] Run: `bun install --production`
  - [ ] Run: `bun run build`
  - [ ] Run: `pm2 restart rides-api` (or start if first time)
  - [ ] Verify API is responding
- [ ] Document server setup for team reference

### Phase 3: GitHub Actions CI/CD (45 minutes)
**Goal:** Automate testing and deployment via GitHub Actions

#### 3.1: Create CI Workflow
- [ ] Create `.github/workflows/` directory
- [ ] Create `ci.yml` workflow file
  - [ ] Trigger on: push to any branch, PR to main
  - [ ] Install Bun in CI
  - [ ] Run `bun install`
  - [ ] Run `bun run lint`
  - [ ] Run `bun run check-types`
  - [ ] Run `bun run build`
  - [ ] Cache `~/.bun/install/cache` for faster runs
  - [ ] Run on: ubuntu-latest

#### 3.2: Create Deploy Workflow
- [ ] Create `deploy.yml` workflow file
  - [ ] Trigger on: push to `main` branch only
  - [ ] Require CI workflow to pass first
  - [ ] Steps:
    1. Checkout code
    2. Setup SSH key from GitHub Secret
    3. Add VPS to known_hosts
    4. SSH into VPS and run deployment commands:
       - `cd ~/rides-api`
       - `git pull origin main`
       - `bun install --production`
       - `bun run db:migrate` (run migrations)
       - `bun run build`
       - `pm2 restart rides-api`
    5. Verify deployment (health check)
    6. Notify on success/failure (optional)

#### 3.3: Setup GitHub Secrets
- [ ] Go to GitHub repo → Settings → Secrets and variables → Actions
- [ ] Add secrets:
  - [ ] `VPS_SSH_PRIVATE_KEY` - Contents of `~/.ssh/oracle-rides-key`
  - [ ] `VPS_HOST` - `143.47.251.53`
  - [ ] `VPS_USER` - `ubuntu`
  - [ ] `VPS_APP_PATH` - `/home/ubuntu/rides-api`
- [ ] Optional environment-specific secrets:
  - [ ] `DATABASE_URL` (if needed for migrations in CI)
  - [ ] `API_KEY` (for integration tests when added)

### Phase 4: Testing & Validation (30 minutes)
**Goal:** Ensure everything works end-to-end

- [ ] Test CI workflow
  - [ ] Create a feature branch
  - [ ] Make a small change (e.g., add comment)
  - [ ] Push to GitHub
  - [ ] Verify CI workflow runs and passes
  - [ ] Check Actions tab for logs
- [ ] Test deployment workflow
  - [ ] Merge feature branch to main
  - [ ] Verify deploy workflow triggers
  - [ ] Watch deployment logs in GitHub Actions
  - [ ] SSH to VPS and verify:
    - [ ] Code is updated
    - [ ] PM2 shows app running
    - [ ] API responds to requests
  - [ ] Test API endpoints with Bruno collection
- [ ] Test rollback scenario
  - [ ] Document how to rollback if deployment fails
  - [ ] Test manual rollback: `git checkout <previous-commit>`
  - [ ] Consider adding workflow_dispatch for manual deployments

### Phase 5: Documentation & Cleanup (15 minutes)
**Goal:** Update all documentation and clean up old artifacts

- [ ] Update README.md
  - [ ] Add Bun installation instructions
  - [ ] Update "Getting Started" section
  - [ ] Add CI/CD badge from GitHub Actions
  - [ ] Document deployment process
  - [ ] Add troubleshooting section
- [ ] Create/Update CONTRIBUTING.md
  - [ ] Explain branch strategy (feature → main)
  - [ ] Explain CI/CD process
  - [ ] Coding standards (lint must pass)
- [ ] Update package.json
  - [ ] Add engines field: `"bun": ">=1.0.0"`
  - [ ] Remove unnecessary npm-specific scripts
- [ ] Clean up local environment
  - [ ] Remove `tsx` from devDependencies (now redundant)
  - [ ] Add `prettier-plugin-sort-imports` (optional: auto-organize imports)
- [ ] Create deployment checklist document

## Risk Assessment & Mitigation

### Risks

1. **Bun Package Compatibility**
   - *Risk*: Some npm package may not work with Bun
   - *Likelihood*: Low (tested dependencies are compatible)
   - *Mitigation*: Keep npm available as fallback, test thoroughly locally

2. **CI/CD Pipeline Failures**
   - *Risk*: Deployment automation might fail
   - *Likelihood*: Medium (first-time setup issues)
   - *Mitigation*: Keep manual SSH deploy script, test in staging first

3. **SSH Key Security**
   - *Risk*: GitHub secrets could be exposed
   - *Likelihood*: Low (GitHub encrypts secrets)
   - *Mitigation*: Use SSH key specific to deployment, rotate regularly

4. **Zero-Downtime Deployment**
   - *Risk*: PM2 restart might cause brief downtime
   - *Likelihood*: High (PM2 restart has ~100ms gap)
   - *Mitigation*: Use `pm2 reload` instead of `pm2 restart` (graceful restart)

5. **Database Migration Failures**
   - *Risk*: Migrations could fail mid-deployment
   - *Likelihood*: Medium (schema changes can be complex)
   - *Mitigation*: 
     - Run migrations before code deployment
     - Use separate migration workflow with manual approval for breaking changes
     - Keep backups via Supabase

### Rollback Plan

If deployment fails:
1. GitHub Actions will show failure in logs
2. Manual intervention:
   ```bash
   ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53
   cd ~/rides-api
   git log --oneline -5  # Find last good commit
   git checkout <previous-commit>
   bun install --production
   bun run build
   pm2 reload rides-api
   ```
3. Fix issue in a new branch, test in CI, then merge

## Timeline Estimate

- **Phase 1**: 30 minutes (local migration)
- **Phase 2**: 20 minutes (VPS setup)
- **Phase 3**: 45 minutes (CI/CD setup)
- **Phase 4**: 30 minutes (testing)
- **Phase 5**: 15 minutes (documentation)

**Total**: ~2.5 hours

**Recommended Schedule:**
- Day 1: Phases 1-2 (local + VPS setup, 50 min)
- Day 2: Phase 3 (CI/CD, 45 min)
- Day 3: Phases 4-5 (testing + docs, 45 min)

## Success Criteria

- ✅ Local development runs with `bun run dev`
- ✅ All scripts in package.json work with Bun
- ✅ VPS successfully runs application with Bun
- ✅ CI workflow runs on every push/PR
- ✅ Deployment workflow runs on merge to main
- ✅ Deployments complete in <2 minutes
- ✅ API remains responsive during deployment
- ✅ Zero manual SSH commands needed for normal deployments
- ✅ Team can see deployment status in GitHub Actions UI

## Future Enhancements

1. **Testing**: Add `bun test` when tests are written
2. **Preview Deployments**: Deploy PRs to staging environment
3. **Environment Management**: Separate prod/staging configurations
4. **Monitoring**: Add health check pings, error tracking (Sentry)
5. **Security Scanning**: Add dependency vulnerability scanning
6. **Performance**: Add bundle size tracking
7. **Notifications**: Slack/Discord webhooks for deployment status

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [Bun with Hono Guide](https://hono.dev/getting-started/bun)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Drizzle with Bun](https://orm.drizzle.team/docs/get-started-postgresql#bun)

---

## Notes

- Current Node version: v24.2.0
- Current Bun version: v1.3.6 (local)
- VPS: Ubuntu 24.04, sudo access
- Database: External (Supabase)
- Current deployment: Manual SSH + PM2
- Git remote: git@github.com:airburst/rides-api.git
