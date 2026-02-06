#!/usr/bin/env bash
# Redis Setup Script for Ubuntu 24.04 VPS
# Run this on the VPS to install and configure Redis for the Rides API

set -e

echo "🔧 Installing Redis..."
sudo apt-get update
sudo apt-get install -y redis-server

echo "⚙️  Configuring Redis for production..."

# Backup original config
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.backup

# Configure Redis settings
sudo tee -a /etc/redis/redis.conf > /dev/null << 'EOF'

# ===== Rides API Production Settings =====

# Memory Management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (RDB snapshots)
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
dir /var/lib/redis

# Security
bind 127.0.0.1 ::1
protected-mode yes
requirepass CHANGE_THIS_PASSWORD

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
EOF

echo "🔐 IMPORTANT: Set a Redis password!"
echo "Edit /etc/redis/redis.conf and replace 'CHANGE_THIS_PASSWORD' with a strong password"
echo ""
echo "Then restart Redis:"
echo "  sudo systemctl restart redis-server"
echo ""
echo "And update your .env file:"
echo "  REDIS_URL=redis://:YOUR_PASSWORD@localhost:6379"
echo "  CACHE_ENABLED=true"
echo "  CACHE_TTL=300"
echo ""

# Enable Redis to start on boot
sudo systemctl enable redis-server

echo "✅ Redis installation complete!"
echo "📝 Next steps:"
echo "  1. Set Redis password in /etc/redis/redis.conf"
echo "  2. Restart Redis: sudo systemctl restart redis-server"
echo "  3. Test connection: redis-cli -a YOUR_PASSWORD ping"
echo "  4. Update .env with REDIS_URL"
echo "  5. Restart API: pm2 reload ecosystem.config.cjs"
