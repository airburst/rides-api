# GitHub Actions Setup Guide

## Required GitHub Secrets

To enable automated CI/CD, you need to add the following secrets to your GitHub repository:

### How to Add Secrets

1. Go to your GitHub repository: `https://github.com/airburst/rides-api`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret below:

---

### Secrets to Add

#### 1. `VPS_SSH_PRIVATE_KEY`
**Description:** SSH private key for deployment access to VPS

**Value:** Contents of `~/.ssh/oracle-rides-key`

**How to get it:**
```bash
cat ~/.ssh/oracle-rides-key
```

Copy the entire output including:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

---

#### 2. `VPS_HOST`
**Description:** VPS hostname or IP address

**Value:** 
```
143.47.251.53
```

---

#### 3. `VPS_USER`
**Description:** SSH username for VPS

**Value:**
```
ubuntu
```

---

#### 4. `VPS_APP_PATH`
**Description:** Full path to application directory on VPS

**Value:**
```
/home/ubuntu/rides-api
```

---

## Workflows Created

### 1. CI Workflow (`.github/workflows/ci.yml`)
**Triggers:** On every push and pull request
**Jobs:**
- Install dependencies with Bun
- Run linter (`bun run lint`)
- Run type checking (`bun run check-types`)
- Build application (`bun run build`)

### 2. Deploy Workflow (`.github/workflows/deploy.yml`)
**Triggers:** On push to `main` branch (after CI passes)
**Jobs:**
- SSH into VPS
- Pull latest code
- Install production dependencies
- Run database migrations
- Build application
- Reload PM2 gracefully
- Health check verification

---

## Testing the Setup

### Test CI Workflow
1. Create a feature branch: `git checkout -b test-ci`
2. Make a small change (e.g., add a comment)
3. Push: `git push origin test-ci`
4. Check GitHub Actions tab for CI results

### Test Deployment Workflow
1. Merge to main: `git checkout main && git merge test-ci`
2. Push: `git push origin main`
3. Watch GitHub Actions tab
4. Verify deployment on VPS
5. Test API: `curl http://143.47.251.53:3001/health`

---

## Manual Deployment

You can manually trigger deployment:
1. Go to GitHub Actions tab
2. Select "Deploy to Production" workflow
3. Click "Run workflow" → select `main` branch → Run

---

## Troubleshooting

### SSH Key Issues
If deployment fails with SSH errors:
1. Verify the SSH key is correct
2. Check key permissions: `chmod 600 ~/.ssh/oracle-rides-key`
3. Test SSH manually: `ssh -i ~/.ssh/oracle-rides-key ubuntu@143.47.251.53`

### PM2 Reload Issues
If PM2 reload fails:
1. SSH into VPS
2. Check PM2 status: `pm2 list`
3. Check logs: `pm2 logs rides-api --lines 50`
4. Restart manually: `pm2 restart rides-api`

### Health Check Failures
If health check fails:
1. Verify app is running: `pm2 list`
2. Check firewall: `sudo ufw status`
3. Test locally on VPS: `curl http://localhost:3001/health`

---

## Security Notes

- SSH private key is stored encrypted in GitHub Secrets
- Key is only used during deployment
- Key is deleted after each workflow run
- All secrets are masked in workflow logs

---

## Next Steps

After setting up secrets:
1. Test the CI workflow with a test commit
2. Test the deployment workflow by merging to main
3. Monitor GitHub Actions for any issues
4. Update documentation with CI/CD badges
# Test automated deployment
