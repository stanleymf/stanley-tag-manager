# Data Persistence in Stanley Tag Manager

This document explains how the Stanley Tag Manager preserves your configurations, tagging rules, and settings across deployments.

## Overview

The app now supports **persistent storage** using PostgreSQL database to ensure that your tagging rules and other configurations are preserved when you deploy updates.

## What Gets Persisted

✅ **Tagging Rules**: All your custom tagging rules with their triggers and actions  
✅ **User Sessions**: Login sessions (24-hour expiry)  
✅ **Segment Cache**: Shopify segments cache (5-minute TTL for performance)  
✅ **App Configuration**: Any custom settings you configure  

## Database Setup (Railway)

### Automatic Setup

Railway can automatically provision a PostgreSQL database for your project:

1. **Go to your Railway project dashboard**
2. **Click "New" → "Database" → "PostgreSQL"**
3. **Railway will automatically generate a `DATABASE_URL` environment variable**
4. **Your app will automatically detect and use the database**

### Manual Setup

If you prefer to set up manually:

1. **Create a PostgreSQL database service in Railway**
2. **Copy the connection string from the database dashboard**
3. **Add it as `DATABASE_URL` environment variable**

```bash
DATABASE_URL=postgresql://username:password@host:port/database
```

## Environment Variables

### Required for Persistence
```bash
DATABASE_URL=postgresql://username:password@host:port/database
```

### Complete Configuration
```bash
# Shopify Integration (Required)
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_token_here

# Authentication (Optional - has defaults)
AUTH_USERNAME=admin
AUTH_PASSWORD=windflower2024
SESSION_SECRET=your-random-session-secret

# Database (Optional - uses in-memory fallback)
DATABASE_URL=postgresql://username:password@host:port/database

# System
NODE_ENV=production
PORT=8080
```

## Fallback Behavior

The app is designed to work with or without a database:

### 🟢 **With Database** (Recommended)
- ✅ Tagging rules persist across deployments
- ✅ Sessions persist across server restarts
- ✅ Efficient segment caching
- ✅ Configuration survives updates

### 🟡 **Without Database** (Fallback)
- ⚠️ Tagging rules reset on each deployment
- ⚠️ Sessions lost on server restart
- ⚠️ In-memory cache only
- ⚠️ Configurations need to be recreated

## Checking Database Status

### Via Health Check
```bash
curl https://your-app.up.railway.app/api/health
```

Look for these fields:
```json
{
  "configuration": {
    "databaseConfigured": true,
    "databaseConnected": true
  }
}
```

### Via Debug Endpoint
```bash
curl -u "admin:windflower2024" https://your-app.up.railway.app/api/debug/env
```

## Database Schema

The app automatically creates these tables:

### `tagging_rules`
Stores all your custom tagging rules
```sql
- id (Primary Key)
- name
- is_active
- trigger_segment
- actions (JSON)
- created_at
- updated_at
```

### `user_sessions`
Manages login sessions
```sql
- session_id (Primary Key)
- username
- created_at
- expires_at (24 hours)
```

### `segment_cache`
Caches Shopify segments for performance
```sql
- cache_key (Primary Key)
- data (JSON)
- expires_at (5 minutes)
- created_at
```

### `app_config`
Stores app-wide configuration
```sql
- key (Primary Key)
- value (JSON)
- updated_at
```

## Migration Process

When you deploy updates, the app automatically:

1. **Connects to existing database**
2. **Creates any missing tables**
3. **Preserves all existing data**
4. **Runs any schema updates**

No manual migration required! 🎉

## Backup and Recovery

### Automatic Backups
Railway automatically backs up your PostgreSQL database:
- **Point-in-time recovery** available
- **Daily backups** retained for 7 days
- **Access via Railway dashboard**

### Manual Backup
```bash
# Via Railway CLI
railway db:backup

# Or direct PostgreSQL dump
pg_dump $DATABASE_URL > backup.sql
```

### Restore
```bash
# Via Railway dashboard or CLI
railway db:restore backup.sql
```

## Troubleshooting

### "Database not available - using fallback"
- Check that `DATABASE_URL` is set in Railway environment variables
- Verify database service is running in Railway dashboard
- Check database connection permissions

### "Rule not persisted"
- Database connection may have failed
- Check health endpoint for database status
- Verify PostgreSQL service is healthy

### Performance Issues
- Database automatically cleans up expired sessions and cache
- Check Railway database metrics for resource usage
- Consider upgrading database plan if needed

## Migration from In-Memory

If you're upgrading from a version without persistence:

1. **Add DATABASE_URL environment variable**
2. **Deploy the update**
3. **Recreate your tagging rules** (they'll now persist)
4. **Future deployments will preserve everything**

## Benefits

✅ **No more lost configurations** after deployments  
✅ **Reliable session management**  
✅ **Better performance** with database caching  
✅ **Audit trail** of when rules were created/modified  
✅ **Scalable architecture** ready for multiple instances  

Your tagging rules and configurations are now safe! 🛡️ 