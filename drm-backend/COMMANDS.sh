#!/usr/bin/env bash

# ================================================
# DRM Backend - Command Cheat Sheet
# ================================================
# 
# This file contains all the commands you'll need.
# Copy and paste commands from here as needed.
#
# ================================================

# 🚀 First-Time Setup (Do this once)
# ================================================
cd drm-backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and AUTH_JWT_SECRET
npm run db:push
npm run prisma:seed
npm run dev


# 🖥️ Daily Development (Use these every day)
# ================================================
npm run dev                    # Start dev server (auto-reload)
npm run prisma:studio          # Open database UI (http://localhost:5555)


# 🗄️ Database Commands (Schema & Data)
# ================================================
npm run prisma:generate        # Generate Prisma Client after schema changes
npm run db:push               # Push schema to database (no migration file)
npm run prisma:migrate        # Create migration file
npm run prisma:deploy         # Apply migrations in production
npm run db:reset              # Reset database ([WARNING] DESTRUCTIVE - deletes all data)
npm run prisma:seed           # Seed database with test data
npm run prisma:studio         # Open database GUI


# 🧪 Testing & Quality
# ================================================
npm test                      # Run tests
npm run lint                  # Check code quality


# 🔌 Testing the API (Quick commands)
# ================================================

# Login as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drmmedia.com","password":"admin123"}'

# Get user settings (replace YOUR_TOKEN)
curl -X GET http://localhost:3000/api/settings/category/drm \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get audit logs (replace YOUR_TOKEN)
curl -X GET "http://localhost:3000/api/audit/logs?limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Health check
curl http://localhost:3000/health


# 🔧 Common Operations
# ================================================

# After editing prisma/schema.prisma:
npm run prisma:generate
npm run db:push

# After adding new settings in src/services/settingsService.js:
npm run db:push

# To completely reset and start over:
npm run db:reset
npm run prisma:seed

# To view database in browser:
npm run prisma:studio
# Then open http://localhost:5555


# 🐛 Troubleshooting
# ================================================

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Kill process on port 3000 (Mac/Linux)
lsof -ti:3000 | xargs kill -9

# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F


# 📝 Environment Variables (Required in .env)
# ================================================
DATABASE_URL=postgresql://username:password@ep-xxx.aws.neon.tech/neondb?sslmode=require
AUTH_JWT_SECRET=your-secure-random-string-here
DRMTODAY_MERCHANT=your-merchant-uuid
DRMTODAY_ENVIRONMENT=staging
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000


# 🔐 Default Credentials (after seeding)
# ================================================
# Admin: admin@drmmedia.com / admin123 (SUPER_ADMIN)
# User:  user@drmmedia.com / password123 (USER)


# 📋 URLs (After starting server)
# ================================================
# Server:      http://localhost:3000
# Health:      http://localhost:3000/health
# Prisma Studio: http://localhost:5555


# ================================================
# 💡 TIP: Make this file executable for quick use:
#    chmod +x COMMANDS.sh
#    ./COMMANDS.sh
# ================================================
