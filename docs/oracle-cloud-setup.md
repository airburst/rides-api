# Oracle Cloud VM Setup Guide

## Step 1: Create Oracle Cloud Account

1. Go to [cloud.oracle.com](https://cloud.oracle.com)
2. Click "Sign Up" for free tier
3. Provide email, name, country
4. Verify email
5. Enter payment method (won't be charged for Always Free resources)
6. Select home region: **UK South (London)** recommended for UK users

## Step 2: Create Virtual Cloud Network (VCN)

1. Go to **Networking → Virtual Cloud Networks**
2. Click **Start VCN Wizard**
3. Select **Create VCN with Internet Connectivity**
4. Configure:
   - Name: `rides-api-vcn`
   - Compartment: (root)
   - VCN CIDR: `10.0.0.0/16` (default)
   - Public Subnet CIDR: `10.0.0.0/24` (default)
5. Click **Next**, then **Create**

## Step 3: Create Compute Instance

1. Go to **Compute → Instances**
2. Click **Create Instance**
3. Configure:

### Basic Info

- Name: `rides-api`
- Compartment: (root)

### Placement

- Availability Domain: AD-1 (or any available)

### Image and Shape

- Click **Change Image**
- Select **Oracle Linux 8** or **Canonical Ubuntu 22.04**
- Click **Change Shape**
- Select **Specialty and previous generation**
- Select **VM.Standard.E2.1.Micro** (Always Free eligible)
  - 1 OCPU
  - 1 GB RAM

### Networking

- VCN: `rides-api-vcn`
- Subnet: Public Subnet
- Public IPv4 address: **Assign a public IPv4 address**

### Add SSH Keys

- Select **Generate a key pair for me**
- Click **Save Private Key** (download and keep safe!)
- Or paste your existing public key

### Boot Volume

- Keep defaults (50 GB)

4. Click **Create**
5. Wait for instance to be **Running**
6. Note the **Public IP Address**

## Step 4: Configure Security Rules

1. Go to **Networking → Virtual Cloud Networks**
2. Click `rides-api-vcn`
3. Click **Security Lists** in left menu
4. Click **Default Security List**
5. Click **Add Ingress Rules**

Add these rules:

| Source CIDR | Protocol | Port | Description          |
| ----------- | -------- | ---- | -------------------- |
| 0.0.0.0/0   | TCP      | 22   | SSH (already exists) |
| 0.0.0.0/0   | TCP      | 80   | HTTP                 |
| 0.0.0.0/0   | TCP      | 443  | HTTPS                |

Click **Add Ingress Rules** for each.

## Step 5: Connect via SSH

```bash
# Set permissions on downloaded key
chmod 400 ~/Downloads/ssh-key-*.key

# Connect (Oracle Linux)
ssh -i ~/Downloads/ssh-key-*.key opc@<PUBLIC_IP>

# Or (Ubuntu)
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

## Step 6: Configure Server

### Ubuntu 22.04

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be v22.x.x
npm --version

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install -y git

# Configure firewall
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

## Step 7: Install Caddy (HTTPS)

### Ubuntu 22.04

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Enable Caddy
sudo systemctl enable caddy
```

## Step 8: Configure Domain (Optional but Recommended)

### Option A: Use your own domain

1. Add DNS A record pointing to your VM's public IP:

   ```
   api.yourdomain.com → <PUBLIC_IP>
   ```

2. Configure Caddy:

   ```bash
   sudo tee /etc/caddy/Caddyfile << 'EOF'
   api.yourdomain.com {
       reverse_proxy localhost:3001
   }
   EOF

   sudo systemctl restart caddy
   ```

### Option B: Use Cloudflare (free SSL + DDoS protection)

1. Add your domain to Cloudflare
2. Point nameservers to Cloudflare
3. Add A record: `api` → `<PUBLIC_IP>` (Proxied)
4. SSL/TLS mode: Full (strict)

5. Configure Caddy for Cloudflare:

   ```bash
   sudo tee /etc/caddy/Caddyfile << 'EOF'
   :443 {
       reverse_proxy localhost:3001
       tls internal
   }
   EOF

   sudo systemctl restart caddy
   ```

### Option C: No domain (development only)

Use public IP directly:

```
NEXT_PUBLIC_API_URL=http://<PUBLIC_IP>:3001
```

Note: Configure Hono to listen on 0.0.0.0:

```typescript
serve({ fetch: app.fetch, port: 3001, hostname: "0.0.0.0" });
```

And open port 3001 in security list and firewall:

```bash
# Oracle Linux
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# Ubuntu
sudo ufw allow 3001
```

## Step 9: Deploy API

```bash
# Clone your repo
cd ~
git clone https://github.com/yourusername/rides-api.git
cd rides-api

# Install dependencies
npm ci

# Build
npm run build

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgres://user:pass@host:5432/db
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.your-domain.com
PORT=3001
NODE_ENV=production
EOF

# Start with PM2
pm2 start dist/index.js --name rides-api

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (sudo env PATH=...)
```

## Step 10: Verify Deployment

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs rides-api

# Test locally
curl http://localhost:3001/health

# Test externally (from your local machine)
curl https://api.yourdomain.com/health
# or
curl http://<PUBLIC_IP>:3001/health
```

## Maintenance Commands

```bash
# View logs
pm2 logs rides-api

# Restart API
pm2 restart rides-api

# Stop API
pm2 stop rides-api

# Update and redeploy
cd ~/rides-api
git pull
npm ci
npm run build
pm2 restart rides-api

# Monitor resources
pm2 monit
```

## Create Deploy Script

```bash
cat > ~/rides-api/deploy.sh << 'EOF'
#!/bin/bash
set -e
cd ~/rides-api
echo "Pulling latest changes..."
git pull
echo "Installing dependencies..."
npm ci
echo "Building..."
npm run build
echo "Restarting PM2..."
pm2 restart rides-api
echo "Done!"
EOF

chmod +x ~/rides-api/deploy.sh
```

Then deploy from local:

```bash
ssh -i ~/path/to/key.pem opc@<PUBLIC_IP> 'bash ~/rides-api/deploy.sh'
```

## Troubleshooting

### Can't connect via SSH

- Check security list has port 22 open
- Check you're using correct username (opc or ubuntu)
- Check key permissions: `chmod 400 key.pem`

### API not accessible externally

- Check security list has port 443/3001 open
- Check OS firewall: `sudo firewall-cmd --list-all` or `sudo ufw status`
- Check PM2 is running: `pm2 status`
- Check Caddy is running: `sudo systemctl status caddy`

### Database connection fails

- Check DATABASE_URL is correct
- Check Supabase allows connections from your VM IP
- Try connecting manually: `psql $DATABASE_URL`

### SSL certificate errors

- Wait a few minutes for Let's Encrypt to issue certificate
- Check Caddy logs: `sudo journalctl -u caddy`
- Ensure DNS is pointing to correct IP
