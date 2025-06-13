import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import * as db from './database.js';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://your-app-name.up.railway.app']
    : ['http://localhost:4321', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist/client')));

// Cache for segments (fallback when database is not available)
let segmentsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Environment variable validation
const requiredEnvVars = {
  SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL,
  SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN,
};

// Check for missing critical environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.warn('⚠️  Missing environment variables:', missingVars.join(', '));
  console.warn('   App may not function properly without these variables');
}

// Authentication configuration with fallbacks
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'windflower2024';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Log configuration status (without sensitive values)
console.log('🔧 Configuration Status:');
console.log(`   Authentication: ${AUTH_USERNAME ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Shopify Store: ${process.env.SHOPIFY_STORE_URL ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Shopify Token: ${process.env.SHOPIFY_ACCESS_TOKEN ? '✅ Configured' : '❌ Missing'}`);

// Initialize database connection
let dbInitialized = false;
async function initDB() {
  try {
    await db.initializeDatabase();
    dbInitialized = true;
    
    // Clean up expired data on startup
    await db.cleanupExpiredData();
    
    // Set up periodic cleanup (every hour)
    setInterval(async () => {
      await db.cleanupExpiredData();
    }, 60 * 60 * 1000);
    
  } catch (error) {
    console.warn('⚠️  Database initialization failed, using in-memory fallback');
    dbInitialized = false;
  }
}

// Fallback in-memory session store when database is not available
const sessions = new Map();

// Authentication middleware
function requireAuth(req, res, next) {
  // Skip auth for health check
  if (req.path === '/api/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please provide valid credentials' 
    });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    next();
  } else {
    res.status(401).json({ 
      error: 'Invalid credentials',
      message: 'Username or password is incorrect' 
    });
  }
}

// Add a new API endpoint for getting customer count of a specific segment
async function handleSegmentCount(req, res) {
  try {
    const segmentName = req.query.segment;
    console.log(`=== SEGMENT COUNT API CALLED for segment: ${segmentName} ===`);
    
    if (!segmentName) {
      return res.status(400).json({ error: 'Segment parameter is required' });
    }
    
    // First, get the segment to find its ID
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.name === segmentName);
    
    if (!segment) {
      return res.status(404).json({ error: `Segment not found: ${segmentName}` });
    }

    let customerCount = 0;

    // If it's a Shopify segment (has proper ID), get count via GraphQL
    if (segment.id && segment.id.startsWith('gid://shopify/')) {
      customerCount = await getSegmentCustomerCount(segment.id);
    } else {
      // Fallback for basic segments
      switch (segmentName) {
        case 'All Customers':
          customerCount = await getAllCustomerCount();
          break;
        case 'VIP Customers':
          customerCount = await getCustomerCountByTag('VIP');
          break;
        case 'VVIP Customers':
          customerCount = await getCustomerCountByTag('VVIP');
          break;
        case 'New Customers':
          customerCount = await getNewCustomerCount();
          break;
        case 'Repeat Buyers':
          customerCount = await getRepeatBuyerCount();
          break;
        default:
          customerCount = 0;
      }
    }
    
    console.log(`✅ Count for ${segmentName}: ${customerCount} customers`);
    res.json({
      success: true,
      segment: segmentName,
      segmentId: segment.id,
      customerCount: customerCount,
      fetchedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting segment count:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get segment count', 
      details: error.message 
    });
  }
}

// Add a new API endpoint for syncing customers in a specific segment
async function handleCustomersSync(req, res) {
  try {
    const segmentName = req.query.segment;
    console.log(`=== CUSTOMERS SYNC API CALLED for segment: ${segmentName} ===`);
    
    if (!segmentName) {
      return res.status(400).json({ error: 'Segment parameter is required' });
    }
    
    // First, get the segment to find its ID
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.name === segmentName);
    
    if (!segment) {
      return res.status(404).json({ error: `Segment not found: ${segmentName}` });
    }

    // If it's a Shopify segment (has proper ID), sync all customers
    if (segment.id && segment.id.startsWith('gid://shopify/')) {
      // Get the actual customer count first
      const expectedCount = await getSegmentCustomerCount(segment.id);
      console.log(`🔄 Starting full sync for segment: ${segmentName} (${expectedCount} expected customers)`);
      
      const customers = await getCustomersFromShopifySegment(segment.id);
      
      console.log(`✅ Synced ${customers.length} customers for segment: ${segmentName}`);
      res.json({
        success: true,
        message: `Successfully synced ${customers.length} customers from segment: ${segmentName}`,
        segment: segmentName,
        segmentId: segment.id,
        expectedCount: expectedCount,
        actualCount: customers.length,
        customers: customers,
        syncedAt: new Date().toISOString()
      });
    } else {
      // Fallback for basic segments
      const customers = await getCustomersFromBasicSegment(segmentName);
      res.json({
        success: true,
        message: `Synced ${customers.length} customers from basic segment: ${segmentName}`,
        segment: segmentName,
        customers: customers,
        syncedAt: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Error syncing customers:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync customers', 
      details: error.message 
    });
  }
}

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Save session to database if available, otherwise use memory
    if (dbInitialized) {
      await db.saveSession(sessionId, username);
    } else {
      sessions.set(sessionId, { username, createdAt: Date.now() });
    }
    
    res.json({ 
      success: true, 
      sessionId,
      message: 'Login successful' 
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid credentials' 
    });
  }
});

// Protected API Routes
app.get('/api/segments', requireAuth, handleSegments);
app.post('/api/segments/sync', requireAuth, handleSegmentsSync);
app.get('/api/customers', requireAuth, handleCustomers);
app.post('/api/bulk-tag', requireAuth, handleBulkTag);
app.get('/api/rules', requireAuth, handleGetRules);
app.post('/api/rules', requireAuth, handleCreateRule);
app.put('/api/rules/:id', requireAuth, handleUpdateRule);
app.delete('/api/rules/:id', requireAuth, handleDeleteRule);
app.post('/api/rules/:id/execute', requireAuth, handleExecuteRule);
app.get('/api/segments/count', requireAuth, handleSegmentCount);
app.get('/api/customers/sync', requireAuth, handleCustomersSync);

// Health check with configuration status
app.get('/api/health', async (req, res) => {
  const config = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    configuration: {
      shopifyConfigured: !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN),
      authConfigured: !!(AUTH_USERNAME && AUTH_PASSWORD),
      databaseConfigured: !!process.env.DATABASE_URL,
      databaseConnected: dbInitialized && await db.isDatabaseConnected(),
      storeUrl: process.env.SHOPIFY_STORE_URL ? 'configured' : 'missing',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'missing',
      authUsername: AUTH_USERNAME ? 'configured' : 'missing',
      sessionSecret: SESSION_SECRET ? 'configured' : 'missing',
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
    }
  };

  // Add warnings for missing configuration
  const warnings = [];
  if (!process.env.SHOPIFY_STORE_URL) warnings.push('SHOPIFY_STORE_URL missing');
  if (!process.env.SHOPIFY_ACCESS_TOKEN) warnings.push('SHOPIFY_ACCESS_TOKEN missing');
  if (!process.env.DATABASE_URL) warnings.push('DATABASE_URL missing - using in-memory storage');
  
  if (warnings.length > 0) {
    config.warnings = warnings;
    config.status = 'degraded';
  }

  res.json(config);
});

// Debug endpoint to show environment variables
app.get('/api/debug/env', (req, res) => {
  try {
    const envVars = {
      shopifyVars: {},
      authVars: {},
      systemVars: {}
    };

    // Get all environment variables starting with SHOPIFY
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SHOPIFY')) {
        envVars.shopifyVars[key] = {
          exists: !!process.env[key],
          length: process.env[key]?.length || 0,
          prefix: process.env[key]?.substring(0, 10) || 'undefined'
        };
      }
    });

    // Get auth-related variables
    ['AUTH_USERNAME', 'AUTH_PASSWORD', 'SESSION_SECRET'].forEach(key => {
      envVars.authVars[key] = {
        exists: !!process.env[key],
        length: process.env[key]?.length || 0,
        value: key === 'AUTH_USERNAME' ? process.env[key] : '***masked***'
      };
    });

    // Get system variables
    ['NODE_ENV', 'PORT', 'npm_package_version'].forEach(key => {
      envVars.systemVars[key] = process.env[key] || 'undefined';
    });

    // Summary
    const summary = {
      totalEnvVars: Object.keys(process.env).length,
      shopifyVarsCount: Object.keys(envVars.shopifyVars).length,
      allShopifyKeys: Object.keys(process.env).filter(key => key.includes('SHOPIFY') || key.includes('STORE') || key.includes('ACCESS')),
      timestamp: new Date().toISOString()
    };

    res.json({
      summary,
      variables: envVars,
      message: 'Environment variables debug info'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get environment variables',
      details: error.message
    });
  }
});

// Debug endpoint to test GraphQL query specifically
app.get('/api/debug/graphql', async (req, res) => {
  try {
    console.log('=== GraphQL DEBUG ENDPOINT CALLED ===');
    
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!storeUrl || !accessToken) {
      return res.json({
        error: 'Missing credentials',
        storeUrl: !!storeUrl,
        accessToken: !!accessToken,
        storeUrlValue: storeUrl ? storeUrl.substring(0, 20) + '...' : 'undefined',
        accessTokenLength: accessToken?.length || 0
      });
    }

    const query = `
      query getSegments($first: Int!) {
        segments(first: $first) {
          edges {
            node {
              id
              name
              query
              creationDate
              lastEditDate
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    console.log('Making GraphQL request...');
    const response = await fetch(
      `${storeUrl}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { first: 250 } // Shopify GraphQL maximum limit
        })
      }
    );

    console.log('GraphQL Response Status:', response.status);
    const responseText = await response.text();
    console.log('GraphQL Raw Response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return res.json({
        error: 'Failed to parse response',
        status: response.status,
        rawResponse: responseText.substring(0, 500),
        parseError: parseError.message
      });
    }

    res.json({
      success: response.ok,
      status: response.status,
      data: data,
      segmentCount: data.data?.segments?.edges?.length || 0,
      hasErrors: !!data.errors,
      errors: data.errors || null
    });

  } catch (error) {
    console.error('GraphQL debug error:', error);
    res.status(500).json({
      error: 'GraphQL debug failed',
      details: error.message,
      stack: error.stack
    });
  }
});

// Debug endpoint to test Shopify connection
app.get('/api/debug/shopify', async (req, res) => {
  try {
    console.log('Testing Shopify connection...');
    console.log('Store URL:', process.env.SHOPIFY_STORE_URL);
    console.log('Access Token configured:', !!process.env.SHOPIFY_ACCESS_TOKEN);
    
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({
        error: 'Missing Shopify configuration',
        storeUrl: !!process.env.SHOPIFY_STORE_URL,
        accessToken: !!process.env.SHOPIFY_ACCESS_TOKEN
      });
    }

    // Test basic Shopify API call
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Shopify API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Shopify API error:', errorText);
      return res.status(500).json({
        error: 'Shopify API error',
        status: response.status,
        details: errorText
      });
    }

    const shopData = await response.json();
    console.log('Shop name:', shopData.shop?.name);

    res.json({
      success: true,
      shopName: shopData.shop?.name,
      shopDomain: shopData.shop?.domain,
      apiStatus: 'connected'
    });
  } catch (error) {
    console.error('Shopify debug error:', error);
    res.status(500).json({
      error: 'Connection failed',
      details: error.message
    });
  }
});

// Test endpoint to check Shopify REST API access
app.get('/api/test/shopify', requireAuth, async (req, res) => {
  try {
    console.log('=== TESTING SHOPIFY REST API ACCESS ===');
    
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=5`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        }
      }
    );
    
    console.log(`Shopify REST API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify REST API error:', errorText);
      return res.json({
        success: false,
        error: `HTTP ${response.status}`,
        details: errorText.substring(0, 500)
      });
    }
    
    const data = await response.json();
    console.log(`Shopify REST API response:`, JSON.stringify(data, null, 2));
    
    res.json({
      success: true,
      status: response.status,
      customerCount: data.customers?.length || 0,
      customers: data.customers || [],
      message: 'Shopify REST API test completed'
    });
    
  } catch (error) {
    console.error('Shopify REST API test error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint to check Shopify GraphQL API for customer data
app.get('/api/test/customers', requireAuth, async (req, res) => {
  try {
    console.log('=== TESTING SHOPIFY GRAPHQL FOR CUSTOMERS ===');
    
    // Test 1: Try to get customers directly via GraphQL
    const customerQuery = `
      query getCustomers($first: Int!) {
        customers(first: $first) {
          edges {
            node {
              id
              firstName
              lastName
              email
              numberOfOrders
              tags
              createdAt
              updatedAt
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;
    
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: customerQuery,
          variables: { first: 5 }
        })
      }
    );
    
    console.log(`GraphQL response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('GraphQL error:', errorText);
      return res.json({
        success: false,
        error: `HTTP ${response.status}`,
        details: errorText.substring(0, 500)
      });
    }
    
    const data = await response.json();
    console.log('GraphQL response:', JSON.stringify(data, null, 2));
    
    const customers = data.data?.customers?.edges?.map(edge => edge.node) || [];
    
    res.json({
      success: true,
      status: response.status,
      data: data,
      customerCount: customers.length,
      customers: customers,
      pageInfo: data.data?.customers?.pageInfo
    });
    
  } catch (error) {
    console.error('GraphQL test error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint for customerSegmentMembers query
app.get('/api/test/segment-members', requireAuth, async (req, res) => {
  try {
    const segmentId = req.query.segmentId || 'gid://shopify/Segment/527351120096';
    console.log(`=== TESTING CUSTOMER SEGMENT MEMBERS for segment: ${segmentId} ===`);
    
    const query = `
      query getSegmentMembers($segmentId: ID!) {
        customerSegmentMembers(segmentId: $segmentId, first: 10) {
          edges {
            node {
              id
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;
    
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { segmentId }
        })
      }
    );
    
    console.log(`GraphQL response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('GraphQL error:', errorText);
      return res.json({
        success: false,
        error: `HTTP ${response.status}`,
        details: errorText.substring(0, 500)
      });
    }
    
    const data = await response.json();
    console.log('GraphQL response:', JSON.stringify(data, null, 2));
    
    const edges = data.data?.customerSegmentMembers?.edges || [];
    
    res.json({
      success: true,
      status: response.status,
      segmentId: segmentId,
      data: data,
      customerCount: edges.length,
      edges: edges,
      pageInfo: data.data?.customerSegmentMembers?.pageInfo
    });
    
  } catch (error) {
    console.error('Segment members test error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/client/index.html'));
});

// API Handler Functions
async function handleSegments(req, res) {
  try {
    console.log('=== SEGMENTS API CALLED ===');
    const cacheKey = 'customer_segments';
    
    // Check database cache first, then fallback to memory cache
    let cachedSegments = null;
    if (dbInitialized) {
      cachedSegments = await db.getCache(cacheKey);
    } else if (segmentsCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      cachedSegments = segmentsCache;
    }
    
    if (cachedSegments) {
      console.log('📦 Returning cached segments');
      return res.json(cachedSegments);
    }
    
    // Fetch fresh segments
    console.log('🔄 Fetching fresh segments from Shopify...');
    const segments = await getCustomerSegments();
    
    // Update cache (database preferred, memory fallback)
    if (dbInitialized) {
      await db.setCache(cacheKey, segments, 5);
    } else {
      segmentsCache = segments;
      cacheTimestamp = Date.now();
    }
    
    console.log(`Returning ${segments.length} fresh segments to frontend`);
    res.json(segments);
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ error: 'Failed to fetch segments', details: error.message });
  }
}

async function handleSegmentsSync(req, res) {
  try {
    console.log('=== SEGMENTS SYNC API CALLED ===');
    
    // Clear both memory cache and database cache to force fresh fetch
    segmentsCache = null;
    cacheTimestamp = null;
    
    // Clear database cache if available
    if (dbInitialized) {
      // Note: We'll let the cache expire naturally or overwrite it
      console.log('🗄️ Database cache will be refreshed with new data');
    }
    
    // Fetch fresh segments from Shopify
    console.log('🔄 Fetching fresh segments with pagination limit: 250 (Shopify maximum)');
    const segments = await getCustomerSegments();
    
    // Update both caches with fresh data
    if (dbInitialized) {
      await db.setCache('customer_segments', segments, 5);
    } else {
      segmentsCache = segments;
      cacheTimestamp = Date.now();
    }
    
    console.log(`✅ Synced ${segments.length} segments from Shopify (up from previous limit)`);
    res.json({ 
      success: true, 
      message: `Successfully synced ${segments.length} segments from Shopify (max 250 limit)`,
      segments: segments,
      syncedAt: new Date().toISOString(),
      paginationLimit: 250
    });
  } catch (error) {
    console.error('Error syncing segments:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync segments from Shopify', 
      details: error.message 
    });
  }
}

async function handleCustomers(req, res) {
  try {
    const segmentName = req.query.segment;
    console.log(`=== CUSTOMERS API CALLED for segment: ${segmentName} ===`);
    
    if (!segmentName) {
      return res.status(400).json({ error: 'Segment parameter is required' });
    }
    
    const customers = await getCustomersBySegment(segmentName);
    console.log(`Returning ${customers.length} customers for segment: ${segmentName}`);
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
}

async function handleBulkTag(req, res) {
  try {
    const { customerIds, actions } = req.body;
    
    if (!customerIds || !actions) {
      return res.status(400).json({ error: 'customerIds and actions are required' });
    }
    
    const result = await applyBulkTags(customerIds, actions);
    res.json(result);
  } catch (error) {
    console.error('Error applying bulk tags:', error);
    res.status(500).json({ error: 'Failed to apply bulk tags' });
  }
}

// Rule management handlers
async function handleGetRules(req, res) {
  try {
    console.log('=== GET RULES API CALLED ===');
    const rules = await db.getTaggingRules();
    console.log(`Returning ${rules.length} tagging rules`);
    res.json(rules);
  } catch (error) {
    console.error('Error getting rules:', error);
    res.status(500).json({ error: 'Failed to get rules', details: error.message });
  }
}

async function handleCreateRule(req, res) {
  try {
    console.log('=== CREATE RULE API CALLED ===');
    const ruleData = req.body;
    
    // Generate ID if not provided
    if (!ruleData.id) {
      ruleData.id = `rule-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }
    
    // Set creation timestamp
    if (!ruleData.createdAt) {
      ruleData.createdAt = new Date().toISOString();
    }
    
    const savedRule = await db.saveTaggingRule(ruleData);
    console.log(`Created rule: ${savedRule.name}`);
    res.json(savedRule);
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule', details: error.message });
  }
}

async function handleUpdateRule(req, res) {
  try {
    console.log('=== UPDATE RULE API CALLED ===');
    const ruleId = req.params.id;
    const ruleData = { ...req.body, id: ruleId };
    
    const savedRule = await db.saveTaggingRule(ruleData);
    console.log(`Updated rule: ${savedRule.name}`);
    res.json(savedRule);
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule', details: error.message });
  }
}

async function handleDeleteRule(req, res) {
  try {
    console.log('=== DELETE RULE API CALLED ===');
    const ruleId = req.params.id;
    
    const deleted = await db.deleteTaggingRule(ruleId);
    if (deleted) {
      console.log(`Deleted rule: ${ruleId}`);
      res.json({ success: true, message: 'Rule deleted successfully' });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule', details: error.message });
  }
}

async function handleExecuteRule(req, res) {
  try {
    console.log('=== EXECUTE RULE API CALLED ===');
    const ruleId = req.params.id;
    
    // Get the rule from database
    const rules = await db.getTaggingRules();
    const rule = rules.find(r => r.id === ruleId);
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    if (!rule.isActive) {
      return res.status(400).json({ error: 'Rule is not active' });
    }
    
    const result = await executeTaggingRule(rule);
    res.json(result);
  } catch (error) {
    console.error('Error executing rule:', error);
    res.status(500).json({ error: 'Failed to execute rule', details: error.message });
  }
}

// Shopify API Functions
async function getCustomerSegments() {
  console.log('Getting customer segments from Shopify...');
  
  // Check environment variables first
  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    console.error('Missing Shopify configuration in getCustomerSegments');
    throw new Error('Shopify configuration missing');
  }

  console.log('Store URL:', process.env.SHOPIFY_STORE_URL);
  console.log('Access Token configured:', !!process.env.SHOPIFY_ACCESS_TOKEN);

  try {
    // Fetch real Shopify customer segments using GraphQL (metadata only, no customer counts)
    const query = `
      query getSegments($first: Int!) {
        segments(first: $first) {
          edges {
            node {
              id
              name
              query
              creationDate
              lastEditDate
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    console.log('Making GraphQL request to:', `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`);
    
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { first: 250 } // Shopify GraphQL maximum limit
        })
      }
    );

    console.log('Segments GraphQL response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify GraphQL API error:', errorText);
      // Fall back to basic segments if GraphQL fails
      return await getBasicSegments();
    }

    const data = await response.json();
    console.log('GraphQL Response Status:', response.status);

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      // Fall back to basic segments if GraphQL has errors
      return await getBasicSegments();
    }

    const shopifySegments = data.data?.segments?.edges || [];
    console.log(`Found ${shopifySegments.length} Shopify segments`);
    
    // Debug: Log all segment names
    console.log('Segment names from Shopify:');
    shopifySegments.forEach((edge, index) => {
      console.log(`${index + 1}. ${edge.node.name} (ID: ${edge.node.id})`);
    });
    
    // Check for pagination
    const hasNextPage = data.data?.segments?.pageInfo?.hasNextPage || false;
    console.log('Has more segments (next page):', hasNextPage);

    // Convert Shopify segments to our format WITHOUT fetching customer counts (for speed)
    console.log('Processing segments (metadata only, no customer counts)...');
    const segments = shopifySegments.map((edge) => {
      const segment = edge.node;
      
      return {
        id: segment.id,
        name: segment.name,
        criteria: segment.query || 'Shopify defined segment',
        customerCount: 0, // Will be populated on-demand when user requests it
        lastSync: new Date().toISOString(),
        description: `Segment: ${segment.name}`,
        createdAt: segment.creationDate,
        updatedAt: segment.lastEditDate,
        needsCustomerCount: true // Flag to indicate count needs to be fetched
      };
    });
    
    console.log(`✅ Successfully processed ${segments.length} segment metadata (customer counts will be fetched on-demand)`);

    // Add "All Customers" as the first segment
    const allCustomersSegment = {
      id: 'all-customers',
      name: 'All Customers',
      criteria: 'All registered customers',
      customerCount: 0, // Will be populated on-demand
      lastSync: new Date().toISOString(),
      description: 'Complete customer base',
      needsCustomerCount: true
    };
    segments.unshift(allCustomersSegment);

    console.log('Final segments (fast metadata sync complete):', segments.map(s => `${s.name}: metadata only`));
    return segments;

  } catch (error) {
    console.error('Error fetching Shopify segments:', error);
    // Fall back to basic segments if everything fails
    return await getBasicSegments();
  }
}

// Fallback function for basic segments when Shopify segments API fails
async function getBasicSegments() {
  console.log('Using fallback basic segments...');
  
  const segments = [
    {
      id: 'all',
      name: 'All Customers',
      criteria: 'All registered customers',
      customerCount: await getAllCustomerCount(),
      lastSync: new Date().toISOString(),
      description: 'Complete customer base'
    },
    {
      id: 'vip',
      name: 'VIP Customers',
      criteria: 'customers with "VIP" tag',
      customerCount: await getCustomerCountByTag('VIP'),
      lastSync: new Date().toISOString(),
      description: 'High-value customers'
    },
    {
      id: 'vvip',
      name: 'VVIP Customers',
      criteria: 'customers with "VVIP" tag', 
      customerCount: await getCustomerCountByTag('VVIP'),
      lastSync: new Date().toISOString(),
      description: 'Premium customers'
    },
    {
      id: 'new',
      name: 'New Customers',
      criteria: 'created in last 30 days',
      customerCount: await getNewCustomerCount(),
      lastSync: new Date().toISOString(),
      description: 'Recently registered customers'
    },
    {
      id: 'repeat',
      name: 'Repeat Buyers',
      criteria: 'orders_count > 1',
      customerCount: await getRepeatBuyerCount(),
      lastSync: new Date().toISOString(),
      description: 'Customers with multiple orders'
    }
  ];
  
  return segments;
}

// Get customer count for a specific Shopify segment
async function getSegmentCustomerCount(segmentId) {
  try {
    // Use a different approach - get a small sample and check if there are any customers
    const query = `
      query getSegmentCount($segmentId: ID!) {
        customerSegmentMembers(segmentId: $segmentId, first: 1) {
          edges {
            node {
              id
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;

    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { segmentId }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP ${response.status} for segment count ${segmentId}:`, errorText.substring(0, 200));
      return 0;
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error(`❌ GraphQL errors for segment count ${segmentId}:`, data.errors);
      return 0;
    }
    
    // If we get any customers, we know there are customers in this segment
    // For now, let's use a fallback approach - get all customers and count them
    const customers = await getCustomersFromShopifySegment(segmentId);
    const count = customers.length;
    
    console.log(`📊 Segment ${segmentId}: ${count} customers (from actual customer fetch)`);
    return count;

  } catch (error) {
    console.error(`❌ Exception getting count for segment ${segmentId}:`, error.message);
    return 0; // Return 0 instead of throwing
  }
}

async function getCustomerCountByTag(tag) {
  try {
    console.log(`Getting customer count for tag: ${tag}`);
    const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/count.json?tags=${encodeURIComponent(tag)}`;
    console.log('API URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Response status for tag ${tag}:`, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shopify API error for tag ${tag}:`, errorText);
      return 0;
    }
    
    const data = await response.json();
    console.log(`Count for tag ${tag}:`, data.count);
    return data.count || 0;
  } catch (error) {
    console.error(`Error getting customer count for tag ${tag}:`, error);
    return 0;
  }
}

async function getNewCustomerCount() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/count.json?created_at_min=${thirtyDaysAgo.toISOString()}`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) return 0;
    
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error('Error getting new customer count:', error);
    return 0;
  }
}

async function getAllCustomerCount() {
  try {
    console.log('Getting total customer count...');
    const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/count.json`;
    console.log('API URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    console.log('Response status for total customers:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API error for total customers:', errorText);
      return 0;
    }
    
    const data = await response.json();
    console.log('Total customer count:', data.count);
    return data.count || 0;
  } catch (error) {
    console.error('Error getting total customer count:', error);
    return 0;
  }
}

async function getRepeatBuyerCount() {
  // Placeholder - would require more complex logic to identify repeat buyers
  return 150;
}

async function getCustomersBySegment(segmentName) {
  console.log(`Getting customers for segment: ${segmentName}`);
  
  try {
    // First, try to find the segment by name to get its ID
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.name === segmentName);
    
    if (!segment) {
      console.log(`Segment not found: ${segmentName}`);
      return [];
    }

    // If it's a Shopify segment (has a proper ID), use GraphQL
    if (segment.id && segment.id.startsWith('gid://shopify/')) {
      return await getCustomersFromShopifySegment(segment.id);
    }
    
    // Fallback to REST API for basic segments
    return await getCustomersFromBasicSegment(segmentName);
    
  } catch (error) {
    console.error('Error getting customers by segment:', error);
    return [];
  }
}

// Get customers from a real Shopify segment using REST API with filtering
async function getCustomersFromShopifySegment(segmentId) {
  try {
    console.log(`🔄 Starting REST API fetch for Shopify segment: ${segmentId}`);
    
    // First, get the segment details to understand the filtering criteria
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.id === segmentId);
    
    if (!segment) {
      console.error(`❌ Segment not found: ${segmentId}`);
      return [];
    }
    
    console.log(`📋 Segment criteria: ${segment.criteria}`);
    
    // Use REST API to get customers with segment filtering
    let allCustomers = [];
    let page = 1;
    const limit = 250; // Shopify REST API limit
    let hasMore = true;
    
    while (hasMore) {
      console.log(`📄 Fetching customers page ${page} via REST API`);
      
      try {
        const response = await fetch(
          `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=${limit}&page=${page}`,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            }
          }
        );
        
        if (!response.ok) {
          console.error(`❌ REST API error: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        const customers = data.customers || [];
        
        console.log(`📋 Retrieved ${customers.length} customers from page ${page}`);
        
        if (customers.length === 0) {
          hasMore = false;
          break;
        }
        
        // Filter customers based on segment criteria
        const filteredCustomers = customers.filter(customer => {
          return matchesSegmentCriteria(customer, segment.criteria);
        });
        
        console.log(`🔍 Filtered ${filteredCustomers.length} customers matching criteria from page ${page}`);
        
        const processedCustomers = filteredCustomers.map(customer => ({
          id: customer.id.toString(),
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          email: customer.email || '',
          phone: customer.phone || '',
          created_at: customer.created_at || new Date().toISOString(),
          updated_at: customer.updated_at || new Date().toISOString(),
          tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : (customer.tags || ''),
          orders_count: customer.orders_count || 0,
          total_spent: customer.total_spent || '0.00',
          addresses: customer.addresses || [],
          display_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          note: customer.note || ''
        }));
        
        allCustomers = allCustomers.concat(processedCustomers);
        console.log(`✅ Processed ${processedCustomers.length} matching customers (total: ${allCustomers.length})`);
        
        // Check if we have more pages
        if (customers.length < limit) {
          hasMore = false;
        } else {
          page++;
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Error fetching page ${page}:`, error.message);
        break;
      }
    }
    
    console.log(`🎉 Successfully retrieved ${allCustomers.length} customers matching segment criteria via REST API`);
    return allCustomers;
    
  } catch (error) {
    console.error(`💥 Critical error getting customers from Shopify segment ${segmentId}:`, error);
    return [];
  }
}

// Helper function to check if a customer matches segment criteria
function matchesSegmentCriteria(customer, criteria) {
  try {
    console.log(`🔍 Checking customer ${customer.email} against criteria: ${criteria}`);
    
    // Simple criteria matching for common patterns
    if (criteria.includes('customer_email_domain =')) {
      const domainMatch = criteria.match(/customer_email_domain = '([^']+)'/);
      if (domainMatch) {
        const requiredDomain = domainMatch[1];
        const customerDomain = customer.email ? customer.email.split('@')[1] : '';
        const matches = customerDomain === requiredDomain;
        console.log(`📧 Domain check: ${customerDomain} === ${requiredDomain} = ${matches}`);
        return matches;
      }
    }
    
    if (criteria.includes('customer_tags CONTAINS')) {
      const tagMatch = criteria.match(/customer_tags CONTAINS '([^']+)'/);
      if (tagMatch) {
        const requiredTag = tagMatch[1];
        const customerTags = customer.tags || '';
        const matches = customerTags.includes(requiredTag);
        console.log(`🏷️ Tag check: "${customerTags}" contains "${requiredTag}" = ${matches}`);
        return matches;
      }
    }
    
    if (criteria.includes('number_of_orders')) {
      const orderMatch = criteria.match(/number_of_orders\s*([><=]+)\s*(\d+)/);
      if (orderMatch) {
        const operator = orderMatch[1];
        const requiredOrders = parseInt(orderMatch[2]);
        const customerOrders = customer.orders_count || 0;
        
        let matches = false;
        switch (operator) {
          case '>':
            matches = customerOrders > requiredOrders;
            break;
          case '>=':
            matches = customerOrders >= requiredOrders;
            break;
          case '<':
            matches = customerOrders < requiredOrders;
            break;
          case '<=':
            matches = customerOrders <= requiredOrders;
            break;
          case '=':
            matches = customerOrders === requiredOrders;
            break;
        }
        
        console.log(`📦 Orders check: ${customerOrders} ${operator} ${requiredOrders} = ${matches}`);
        return matches;
      }
    }
    
    // Default: if we can't parse the criteria, return false
    console.log(`❓ Unknown criteria format: ${criteria}`);
    return false;
    
  } catch (error) {
    console.error(`❌ Error matching criteria:`, error);
    return false;
  }
}

// Fallback function for basic segments using REST API
async function getCustomersFromBasicSegment(segmentName) {
  let endpoint = '';
  
  switch (segmentName) {
    case 'All Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=300`;
      break;
    case 'VIP Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VIP&limit=300`;
      break;
    case 'VVIP Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VVIP&limit=300`;
      break;
    case 'New Customers':
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?created_at_min=${thirtyDaysAgo.toISOString()}&limit=300`;
      break;
    default:
      return [];
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    return data.customers || [];
  } catch (error) {
    console.error('Error getting customers by basic segment:', error);
    return [];
  }
}

async function applyBulkTags(customerIds, actions) {
  const results = { success: 0, failed: 0, errors: [] };

  for (const customerId of customerIds) {
    try {
      // Get current customer data
      const customerResponse = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/${customerId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!customerResponse.ok) {
        results.failed++;
        results.errors.push(`Failed to fetch customer ${customerId}`);
        continue;
      }

      const customerData = await customerResponse.json();
      const currentTags = customerData.customer.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      
      // Apply tag actions
      let newTags = [...currentTags];
      
      for (const action of actions) {
        if (action.type === 'add' && !newTags.includes(action.tag)) {
          newTags.push(action.tag);
        } else if (action.type === 'remove') {
          newTags = newTags.filter(tag => tag !== action.tag);
        }
      }

      // Update customer with new tags
      const updateResponse = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/${customerId}.json`,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer: {
              id: customerId,
              tags: newTags.join(', ')
            }
          }),
        }
      );

      if (updateResponse.ok) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Failed to update customer ${customerId}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Error processing customer ${customerId}: ${error.message}`);
    }
  }

  return results;
}

async function executeTaggingRule(rule) {
  try {
    // Get customers from the trigger segment
    const customers = await getCustomersBySegment(rule.triggerSegment);
    const customerIds = customers.map(customer => customer.id);
    
    // Apply the rule actions to all customers in the segment
    const result = await applyBulkTags(customerIds, rule.actions);
    
    return {
      rule: rule.name,
      customersProcessed: customerIds.length,
      ...result
    };
  } catch (error) {
    console.error('Error executing tagging rule:', error);
    throw error;
  }
}

// Initialize and start server
async function startServer() {
  try {
    // Initialize database
    await initDB();
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Stanley Tag Manager running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🏪 Shopify Store: ${process.env.SHOPIFY_STORE_URL || 'Not configured'}`);
      console.log(`💾 Database: ${dbInitialized ? '✅ Connected' : '⚠️  In-memory fallback'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('🛑 Shutting down gracefully...');
  await db.closeDatabase();
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default app; 