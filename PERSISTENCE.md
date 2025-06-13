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

# Data Persistence and Rate-Limited Customer Syncing

## Overview

The Stanley Tag Manager now includes comprehensive data persistence and efficient customer syncing capabilities that handle segments with thousands of customers while respecting Shopify's API rate limits.

## Database Configuration

### PostgreSQL Integration
- **Database**: PostgreSQL via Railway
- **Connection**: Automatic fallback to in-memory storage
- **Tables**: `tagging_rules`, `user_sessions`, `segment_cache`, `app_config`
- **Cleanup**: Automatic table creation with error handling

### Environment Variables
```bash
DATABASE_URL=postgresql://postgres:BDMKMHQLWjjpRZfSvXvIVxxlbVfbZitC@postgres.railway.internal:5432/railway
```

## Customer Syncing with Rate Limiting

### Key Features
- **Full Pagination**: Fetches ALL customers from segments (not limited to 250)
- **Rate Limiting**: Respects Shopify's GraphQL API limits (100 points/second)
- **Error Handling**: Automatic retry for rate limit and network errors
- **Progress Tracking**: Real-time sync progress with customer counts

### Shopify API Rate Limits Compliance
- **Query Cost**: 50 customers per page to manage cost points
- **Delay**: 1.2 seconds between requests to prevent throttling
- **Retry Logic**: Automatic retries for 429 (rate limited) responses
- **Safety Limits**: Maximum 1000 pages to prevent infinite loops

### API Endpoints

#### Sync All Customers in Segment
```http
GET /customers/sync?segment={segmentName}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully synced 2,847 customers from segment: High Value Customers",
  "segment": "High Value Customers",
  "segmentId": "gid://shopify/CustomerSegment/123456789",
  "expectedCount": 3000,
  "actualCount": 2847,
  "customers": [...],
  "syncedAt": "2024-01-15T14:30:00Z"
}
```

#### Regular Customer View (Limited)
```http
GET /customers?segment={segmentName}
```
Returns up to 250 customers for quick viewing.

### Frontend Integration

#### Customer List Modal
- **Sync Button**: "Sync All Customers" for full pagination
- **Progress Indicators**: Real-time sync status and customer counts
- **Export Functionality**: CSV export of all synced customers
- **Error Handling**: Clear error messages and retry options

#### Key Features
```typescript
// Sync all customers with pagination
const result = await apiService.syncCustomersInSegment(segmentName);

// Shows progress: "Retrieved 1,250 of 3,000 expected customers"
```

## Rate Limiting Strategy

### GraphQL Cost Management
- **Page Size**: 50 customers per request (vs 250 maximum)
- **Query Cost**: ~55 points per request (well under 100 limit)
- **Request Interval**: 1.2 seconds between pages
- **Error Recovery**: 3-5 second delays for cost overruns

### Network Resilience
- **Timeout Handling**: Automatic retry for ECONNRESET/ETIMEDOUT
- **Rate Limit Detection**: Recognizes both HTTP 429 and GraphQL throttling
- **Exponential Backoff**: Progressive delays for persistent errors

## Data Structure

### Enhanced Customer Data
```typescript
interface ShopifyCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
  tags: string;
  orders_count: number;
  total_spent: string;
  addresses?: any[];
  display_name?: string;
  note?: string;
}
```

### Segment Tracking
```typescript
interface CustomerSegment {
  id: string;
  name: string;
  customerCount: number;
  lastSync: string;
  criteria?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

## Performance Optimizations

### Caching Strategy
- **Database Cache**: 5-minute TTL for segments
- **Memory Fallback**: In-memory cache when database unavailable
- **Smart Invalidation**: Cache refresh on sync operations

### Pagination Efficiency
- **Cursor-Based**: Uses Shopify's cursor pagination (not offset)
- **Progressive Loading**: Accumulates results across pages
- **Memory Management**: Streams data instead of loading all at once

## Usage Examples

### Syncing Large Segments
```typescript
// For a segment with 5,000 customers:
// - Takes ~2 minutes to complete
// - Makes ~100 paginated requests
// - Respects all rate limits
// - Provides real-time progress

const sync = await apiService.syncCustomersInSegment("VIP Customers");
console.log(`Synced ${sync.actualCount} customers`);
```

### Monitoring Sync Progress
```typescript
// Real-time updates during sync:
// "📄 Fetching page 23 (cursor: eyJsYXN0X2lkIjo...)"
// "✅ Page 23: Retrieved 50 customers (1,150/5,000 total)"
// "⏳ Waiting 1200ms before next page..."
```

## Error Handling

### Common Scenarios
1. **Rate Limiting**: Automatic retry with exponential backoff
2. **Network Issues**: Retry once, then continue to next page
3. **GraphQL Errors**: Parse error type and respond appropriately
4. **Large Segments**: Progress tracking prevents timeout perception

### Monitoring
- **Console Logging**: Detailed sync progress and errors
- **User Feedback**: Clear error messages in UI
- **Recovery**: Graceful degradation to basic segments if needed

## Best Practices

### For Large Stores
- Use "Sync All Customers" for complete data accuracy
- Export to CSV for external analysis
- Monitor sync progress during large operations
- Utilize caching to avoid repeated full syncs

### For Development
- Test with smaller segments first
- Monitor console for rate limit warnings
- Use the 250-limit endpoint for quick testing
- Implement proper error handling in custom integrations

## Migration Notes

### From Previous Version
- Existing 250-customer limit functionality remains for quick viewing
- New pagination system handles unlimited customers
- Database persistence eliminates data loss on deployment
- All APIs maintain backward compatibility

### Performance Improvements
- **Before**: 250 customers max, data lost on restart
- **After**: Unlimited customers, persistent across deployments
- **Sync Time**: ~2 minutes for 5,000 customers (vs instant timeout before)
- **Rate Limits**: Fully compliant with Shopify's latest limits

This implementation provides enterprise-grade customer data handling while maintaining excellent user experience and API compliance. 