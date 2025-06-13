import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import * as db from './database.js';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to fetch all customers with pagination
async function fetchAllCustomersWithPagination(baseUrl, headers, queryParams = {}) {
  const allCustomers = [];
  let hasNextPage = true;
  let pageInfo = null;
  
  console.log(`🔄 Starting paginated fetch from: ${baseUrl}`);
  
  while (hasNextPage) {
    try {
      // Add pagination parameters
      const url = new URL(baseUrl);
      Object.keys(queryParams).forEach(key => url.searchParams.set(key, queryParams[key]));
      
      if (pageInfo?.nextPageInfo?.page_info) {
        url.searchParams.set('page_info', pageInfo.nextPageInfo.page_info);
      } else if (pageInfo?.endCursor) {
        url.searchParams.set('after', pageInfo.endCursor);
      }
      
      console.log(`📄 Fetching page: ${url.toString()}`);
      
      const response = await fetch(url.toString(), { headers });
      
      if (!response.ok) {
        console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
        break;
      }
      
      const data = await response.json();
      
      // Handle different response formats
      let customers = [];
      if (data.customers) {
        // REST API format
        customers = data.customers;
        hasNextPage = customers.length > 0 && customers.length >= (queryParams.limit || 250);
        pageInfo = { nextPageInfo: { page_info: response.headers.get('Link') } };
      } else if (data.data?.customers) {
        // GraphQL format
        customers = data.data.customers.edges.map(edge => edge.node);
        hasNextPage = data.data.customers.pageInfo.hasNextPage;
        pageInfo = data.data.customers.pageInfo;
      }
      
      console.log(`📋 Fetched ${customers.length} customers on this page`);
      allCustomers.push(...customers);
      
      // Rate limiting - wait a bit between requests
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`❌ Error fetching page:`, error);
      break;
    }
  }
  
  console.log(`✅ Total customers fetched: ${allCustomers.length}`);
  return allCustomers;
}

// Helper function to fetch all customers with GraphQL pagination
async function fetchAllCustomersWithGraphQLPagination(query, variables = {}) {
  const allCustomers = [];
  let hasNextPage = true;
  let endCursor = null;
  
  console.log(`🔄 Starting GraphQL paginated fetch`);
  
  while (hasNextPage) {
    try {
      const currentVariables = {
        ...variables,
        after: endCursor
      };
      
      console.log(`📄 Fetching GraphQL page with cursor: ${endCursor || 'initial'}`);
      
      const response = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
            variables: currentVariables
          })
        }
      );
      
      if (!response.ok) {
        console.error(`❌ GraphQL request failed: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (data.errors) {
        console.error(`❌ GraphQL errors:`, data.errors);
        break;
      }
      
      const customers = data.data?.customers?.edges?.map(edge => edge.node) || [];
      const pageInfo = data.data?.customers?.pageInfo;
      
      console.log(`📋 Fetched ${customers.length} customers on this page`);
      allCustomers.push(...customers);
      
      hasNextPage = pageInfo?.hasNextPage || false;
      endCursor = pageInfo?.endCursor || null;
      
      // Rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`❌ Error fetching GraphQL page:`, error);
      break;
    }
  }
  
  console.log(`✅ Total customers fetched via GraphQL: ${allCustomers.length}`);
  return allCustomers;
}

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

// Serve static files from dist directory (after all API routes)
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

// Simple endpoint to list all segments with IDs for debugging
app.get('/api/segments/list', requireAuth, async (req, res) => {
  try {
    console.log('=== SEGMENTS LIST API CALLED ===');
    
    const segments = await getCustomerSegments();
    
    const segmentsList = segments.map(segment => ({
      id: segment.id,
      name: segment.name,
      criteria: segment.criteria,
      created_at: segment.created_at
    }));
    
    console.log(`Returning ${segmentsList.length} segments with IDs`);
    res.json({
      total_segments: segmentsList.length,
      segments: segmentsList,
      champions_segment: segmentsList.find(s => s.name.toLowerCase().includes('champion'))
    });
    
  } catch (error) {
    console.error('Error listing segments:', error);
    res.status(500).json({ error: 'Failed to list segments', details: error.message });
  }
});

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

// Version endpoint
app.get('/api/version', (req, res) => {
  try {
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    res.json({
      version: packageJson.version,
      tagManagerVersion: packageJson.tagManagerVersion,
      versionNotes: packageJson.versionNotes,
      deployedAt: new Date().toISOString(),
      lastCommit: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',
      environment: process.env.NODE_ENV || 'production'
    });
  } catch (error) {
    res.json({
      version: '1.0.0',
      tagManagerVersion: '1.0.0',
      versionNotes: 'Initial release with comprehensive pagination and RFM group support',
      deployedAt: new Date().toISOString(),
      lastCommit: 'unknown',
      environment: process.env.NODE_ENV || 'production',
      error: 'Could not read package.json'
    });
  }
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

// Test endpoint for direct email domain customer fetching
app.get('/api/test/email-domain', requireAuth, async (req, res) => {
  try {
    const domain = req.query.domain || 'windflowerflorist.com';
    console.log(`=== TESTING DIRECT EMAIL DOMAIN CUSTOMER FETCH for domain: ${domain} ===`);
    
    // Use Shopify's customer search by email domain
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=email:*@${domain}`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        }
      }
    );
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Search API error:', errorText);
      return res.json({
        success: false,
        error: `HTTP ${response.status}`,
        details: errorText.substring(0, 500)
      });
    }
    
    const data = await response.json();
    const customers = data.customers || [];
    
    console.log(`📋 Found ${customers.length} customers with domain ${domain}`);
    
    const processedCustomers = customers.map(customer => ({
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
    
    res.json({
      success: true,
      domain: domain,
      customerCount: processedCustomers.length,
      customers: processedCustomers
    });
    
  } catch (error) {
    console.error('Email domain test error:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint to debug segment issues
app.get('/api/test/segment/:segmentId', async (req, res) => {
  try {
    const { segmentId } = req.params;
    console.log(`🧪 Testing segment: ${segmentId}`);
    
    // Get segment details from database
    const segment = await db.get('SELECT * FROM segments WHERE id = ?', [segmentId]);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    
    const results = {
      segment: {
        id: segment.id,
        name: segment.name,
        criteria: segment.criteria,
        created_at: segment.created_at
      },
      tests: {}
    };
    
    console.log(`📋 Testing segment criteria: ${segment.criteria}`);
    
    // Test 1: Check if we can access Shopify API at all
    try {
      const testResponse = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=1`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          }
        }
      );
      
      results.tests.shopify_access = {
        status: testResponse.status,
        ok: testResponse.ok,
        message: testResponse.ok ? 'Shopify API accessible' : 'Shopify API not accessible'
      };
    } catch (error) {
      results.tests.shopify_access = {
        status: 'error',
        ok: false,
        message: error.message
      };
    }
    
    // Test 2: Try to get all customers to see what's available
    try {
      const customersResponse = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=10`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          }
        }
      );
      
      if (customersResponse.ok) {
        const customersData = await customersResponse.json();
        const customers = customersData.customers || [];
        
        results.tests.customer_sample = {
          status: customersResponse.status,
          ok: true,
          total_customers: customers.length,
          sample_customers: customers.map(customer => ({
            id: customer.id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name,
            orders_count: customer.orders_count,
            total_spent: customer.total_spent,
            tags: customer.tags
          }))
        };
      } else {
        results.tests.customer_sample = {
          status: customersResponse.status,
          ok: false,
          message: 'Failed to fetch customers'
        };
      }
    } catch (error) {
      results.tests.customer_sample = {
        status: 'error',
        ok: false,
        message: error.message
      };
    }
    
    // Test 3: Try customer search API with different queries
    if (segment.criteria.includes('rfm_group')) {
      const rfmMatch = segment.criteria.match(/rfm_group = '([^']+)'/);
      if (rfmMatch) {
        const rfmGroup = rfmMatch[1];
        
        // Test search API with RFM group
        try {
          const searchResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=rfm_group:${rfmGroup}`,
            {
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              }
            }
          );
          
          results.tests.rfm_search = {
            status: searchResponse.status,
            ok: searchResponse.ok,
            query: `rfm_group:${rfmGroup}`,
            message: searchResponse.ok ? 'Search API accessible' : 'Search API failed'
          };
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            results.tests.rfm_search.customers_found = searchData.customers?.length || 0;
            results.tests.rfm_search.sample_results = searchData.customers?.slice(0, 3).map(customer => ({
              id: customer.id,
              email: customer.email,
              orders_count: customer.orders_count,
              total_spent: customer.total_spent
            })) || [];
          }
        } catch (error) {
          results.tests.rfm_search = {
            status: 'error',
            ok: false,
            query: `rfm_group:${rfmGroup}`,
            message: error.message
          };
        }
        
        // Test GraphQL with RFM group
        try {
          const graphqlQuery = `
            query testRfmGroup($first: Int!) {
              customers(first: $first, query: "rfm_group:${rfmGroup}") {
                edges {
                  node {
                    id
                    email
                    ordersCount
                    totalSpent
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          `;
          
          const graphqlResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: graphqlQuery,
                variables: {
                  first: 10
                }
              })
            }
          );
          
          results.tests.rfm_graphql = {
            status: graphqlResponse.status,
            ok: graphqlResponse.ok,
            query: `rfm_group:${rfmGroup}`,
            message: graphqlResponse.ok ? 'GraphQL accessible' : 'GraphQL failed'
          };
          
          if (graphqlResponse.ok) {
            const graphqlData = await graphqlResponse.json();
            results.tests.rfm_graphql.errors = graphqlData.errors;
            results.tests.rfm_graphql.customers_found = graphqlData.data?.customers?.edges?.length || 0;
            results.tests.rfm_graphql.sample_results = graphqlData.data?.customers?.edges?.slice(0, 3).map(edge => ({
              id: edge.node.id,
              email: edge.node.email,
              orders_count: edge.node.ordersCount,
              total_spent: edge.node.totalSpent
            })) || [];
          }
        } catch (error) {
          results.tests.rfm_graphql = {
            status: 'error',
            ok: false,
            query: `rfm_group:${rfmGroup}`,
            message: error.message
          };
        }
        
        // Test customer segment endpoint
        try {
          const segmentId = segment.id.replace('gid://shopify/Segment/', '');
          const segmentResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customer_segments/${segmentId}/customers.json`,
            {
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              }
            }
          );
          
          results.tests.segment_endpoint = {
            status: segmentResponse.status,
            ok: segmentResponse.ok,
            segment_id: segmentId,
            message: segmentResponse.ok ? 'Segment endpoint accessible' : 'Segment endpoint failed'
          };
          
          if (segmentResponse.ok) {
            const segmentData = await segmentResponse.json();
            results.tests.segment_endpoint.customers_found = segmentData.customers?.length || 0;
            results.tests.segment_endpoint.sample_results = segmentData.customers?.slice(0, 3).map(customer => ({
              id: customer.id,
              email: customer.email,
              orders_count: customer.orders_count,
              total_spent: customer.total_spent
            })) || [];
          }
        } catch (error) {
          results.tests.segment_endpoint = {
            status: 'error',
            ok: false,
            segment_id: segment.id,
            message: error.message
          };
        }
      }
    }
    
    // Test 4: Try different search queries to see what works
    try {
      const testQueries = [
        'orders_count:>0',
        'total_spent:>0',
        'tag:champion',
        'tag:CHAMPIONS',
        'email:*@windflowerflorist.com'
      ];
      
      results.tests.search_queries = {};
      
      for (const query of testQueries) {
        try {
          const searchResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=${encodeURIComponent(query)}`,
            {
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              }
            }
          );
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            results.tests.search_queries[query] = {
              status: searchResponse.status,
              ok: true,
              customers_found: searchData.customers?.length || 0
            };
          } else {
            results.tests.search_queries[query] = {
              status: searchResponse.status,
              ok: false,
              message: 'Search failed'
            };
          }
        } catch (error) {
          results.tests.search_queries[query] = {
            status: 'error',
            ok: false,
            message: error.message
          };
        }
      }
    } catch (error) {
      results.tests.search_queries = {
        status: 'error',
        ok: false,
        message: error.message
      };
    }
    
    console.log(`✅ Test results for segment ${segmentId}:`, JSON.stringify(results, null, 2));
    res.json(results);
    
  } catch (error) {
    console.error('Error testing segment:', error);
    res.status(500).json({ error: 'Failed to test segment', details: error.message });
  }
});

// Debug endpoint to understand customer data and segment criteria matching
app.get('/api/debug/segment/:segmentId', async (req, res) => {
  try {
    const { segmentId } = req.params;
    console.log(`🔍 Debugging segment: ${segmentId}`);
    
    // Get segment details from database
    const segment = await db.get('SELECT * FROM segments WHERE id = ?', [segmentId]);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    
    const debugInfo = {
      segment: {
        id: segment.id,
        name: segment.name,
        criteria: segment.criteria,
        created_at: segment.created_at
      },
      analysis: {}
    };
    
    console.log(`📋 Analyzing segment criteria: ${segment.criteria}`);
    
    // Step 1: Parse the criteria to understand what we're looking for
    if (segment.criteria.includes('rfm_group')) {
      const rfmMatch = segment.criteria.match(/rfm_group = '([^']+)'/);
      if (rfmMatch) {
        const rfmGroup = rfmMatch[1];
        debugInfo.analysis.criteria_type = 'rfm_group';
        debugInfo.analysis.target_value = rfmGroup;
        debugInfo.analysis.parsed_criteria = `Looking for customers with RFM group: ${rfmGroup}`;
      }
    } else if (segment.criteria.includes('customer_email_domain')) {
      const domainMatch = segment.criteria.match(/customer_email_domain = '([^']+)'/);
      if (domainMatch) {
        const domain = domainMatch[1];
        debugInfo.analysis.criteria_type = 'email_domain';
        debugInfo.analysis.target_value = domain;
        debugInfo.analysis.parsed_criteria = `Looking for customers with email domain: ${domain}`;
      }
    } else if (segment.criteria.includes('customer_tags')) {
      const tagsMatch = segment.criteria.match(/customer_tags = '([^']+)'/);
      if (tagsMatch) {
        const tags = tagsMatch[1];
        debugInfo.analysis.criteria_type = 'tags';
        debugInfo.analysis.target_value = tags;
        debugInfo.analysis.parsed_criteria = `Looking for customers with tags: ${tags}`;
      }
    }
    
    // Step 2: Get a sample of customers to see what data we have
    try {
      const customersResponse = await fetch(
        `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=20`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          }
        }
      );
      
      if (customersResponse.ok) {
        const customersData = await customersResponse.json();
        const customers = customersData.customers || [];
        
        debugInfo.analysis.total_customers_available = customers.length;
        debugInfo.analysis.sample_customers = customers.map(customer => ({
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          orders_count: customer.orders_count,
          total_spent: customer.total_spent,
          tags: customer.tags,
          created_at: customer.created_at,
          updated_at: customer.updated_at
        }));
        
        // Step 3: Analyze how many customers match our criteria
        let matchingCustomers = [];
        
        if (debugInfo.analysis.criteria_type === 'rfm_group') {
          const rfmGroup = debugInfo.analysis.target_value;
          
          // Calculate RFM groups for each customer
          matchingCustomers = customers.filter(customer => {
            const ordersCount = customer.orders_count || 0;
            const totalSpent = parseFloat(customer.total_spent || '0');
            
            let calculatedRfmGroup = 'AT_RISK';
            if (ordersCount >= 5 && totalSpent >= 500) {
              calculatedRfmGroup = 'CHAMPIONS';
            } else if (ordersCount >= 3 && totalSpent >= 200) {
              calculatedRfmGroup = 'LOYAL_CUSTOMERS';
            } else if (ordersCount >= 1 && totalSpent >= 50) {
              calculatedRfmGroup = 'AT_RISK';
            } else {
              calculatedRfmGroup = 'CANT_LOSE';
            }
            
            return calculatedRfmGroup === rfmGroup;
          });
          
          debugInfo.analysis.rfm_calculation = {
            target_rfm_group: rfmGroup,
            customers_with_rfm_calculation: customers.map(customer => {
              const ordersCount = customer.orders_count || 0;
              const totalSpent = parseFloat(customer.total_spent || '0');
              
              let calculatedRfmGroup = 'AT_RISK';
              if (ordersCount >= 5 && totalSpent >= 500) {
                calculatedRfmGroup = 'CHAMPIONS';
              } else if (ordersCount >= 3 && totalSpent >= 200) {
                calculatedRfmGroup = 'LOYAL_CUSTOMERS';
              } else if (ordersCount >= 1 && totalSpent >= 50) {
                calculatedRfmGroup = 'AT_RISK';
              } else {
                calculatedRfmGroup = 'CANT_LOSE';
              }
              
              return {
                id: customer.id,
                email: customer.email,
                orders_count: ordersCount,
                total_spent: totalSpent,
                calculated_rfm_group: calculatedRfmGroup,
                matches_target: calculatedRfmGroup === rfmGroup
              };
            })
          };
          
        } else if (debugInfo.analysis.criteria_type === 'email_domain') {
          const domain = debugInfo.analysis.target_value;
          matchingCustomers = customers.filter(customer => 
            customer.email && customer.email.toLowerCase().includes(`@${domain.toLowerCase()}`)
          );
          
        } else if (debugInfo.analysis.criteria_type === 'tags') {
          const targetTags = debugInfo.analysis.target_value.split(',').map(tag => tag.trim());
          matchingCustomers = customers.filter(customer => {
            const customerTags = customer.tags ? customer.tags.split(',').map(tag => tag.trim()) : [];
            return targetTags.some(tag => customerTags.includes(tag));
          });
        }
        
        debugInfo.analysis.matching_customers_count = matchingCustomers.length;
        debugInfo.analysis.matching_customers = matchingCustomers.map(customer => ({
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          orders_count: customer.orders_count,
          total_spent: customer.total_spent,
          tags: customer.tags
        }));
        
        // Step 4: Test different API approaches
        debugInfo.analysis.api_tests = {};
        
        // Test 1: Direct search API
        if (debugInfo.analysis.criteria_type === 'rfm_group') {
          try {
            const searchResponse = await fetch(
              `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=rfm_group:${debugInfo.analysis.target_value}`,
              {
                headers: {
                  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
                }
              }
            );
            
            debugInfo.analysis.api_tests.search_api = {
              status: searchResponse.status,
              ok: searchResponse.ok,
              query: `rfm_group:${debugInfo.analysis.target_value}`
            };
            
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              debugInfo.analysis.api_tests.search_api.customers_found = searchData.customers?.length || 0;
              debugInfo.analysis.api_tests.search_api.sample_results = searchData.customers?.slice(0, 3) || [];
            }
          } catch (error) {
            debugInfo.analysis.api_tests.search_api = {
              status: 'error',
              ok: false,
              error: error.message
            };
          }
        }
        
        // Test 2: GraphQL approach
        try {
          let graphqlQuery = '';
          if (debugInfo.analysis.criteria_type === 'rfm_group') {
            graphqlQuery = `
              query testRfmGroup($first: Int!) {
                customers(first: $first, query: "rfm_group:${debugInfo.analysis.target_value}") {
                  edges {
                    node {
                      id
                      email
                      ordersCount
                      totalSpent
                    }
                  }
                }
              }
            `;
          } else if (debugInfo.analysis.criteria_type === 'email_domain') {
            graphqlQuery = `
              query testEmailDomain($first: Int!) {
                customers(first: $first, query: "email:*@${debugInfo.analysis.target_value}") {
                  edges {
                    node {
                      id
                      email
                    }
                  }
                }
              }
            `;
          }
          
          if (graphqlQuery) {
            const graphqlResponse = await fetch(
              `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  query: graphqlQuery,
                  variables: {
                    first: 10
                  }
                })
              }
            );
            
            debugInfo.analysis.api_tests.graphql = {
              status: graphqlResponse.status,
              ok: graphqlResponse.ok
            };
            
            if (graphqlResponse.ok) {
              const graphqlData = await graphqlResponse.json();
              debugInfo.analysis.api_tests.graphql.errors = graphqlData.errors;
              debugInfo.analysis.api_tests.graphql.customers_found = graphqlData.data?.customers?.edges?.length || 0;
              debugInfo.analysis.api_tests.graphql.sample_results = graphqlData.data?.customers?.edges?.slice(0, 3) || [];
            }
          }
        } catch (error) {
          debugInfo.analysis.api_tests.graphql = {
            status: 'error',
            ok: false,
            error: error.message
          };
        }
        
      } else {
        debugInfo.analysis.customer_fetch_error = {
          status: customersResponse.status,
          message: 'Failed to fetch customers'
        };
      }
    } catch (error) {
      debugInfo.analysis.customer_fetch_error = {
        status: 'error',
        message: error.message
      };
    }
    
    console.log(`✅ Debug analysis for segment ${segmentId}:`, JSON.stringify(debugInfo, null, 2));
    res.json(debugInfo);
    
  } catch (error) {
    console.error('Error debugging segment:', error);
    res.status(500).json({ error: 'Failed to debug segment', details: error.message });
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
    console.log(`🔢 Getting accurate customer count for segment: ${segmentId}`);
    
    // Get segment details first
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.id === segmentId);
    
    if (!segment) {
      console.error(`❌ Segment not found: ${segmentId}`);
      return 0;
    }
    
    console.log(`📋 Segment criteria: ${segment.criteria}`);
    
    // Use the same logic as the customer sync function to get accurate counts
    if (segment.criteria.includes('customer_email_domain')) {
      const domainMatch = segment.criteria.match(/customer_email_domain = '([^']+)'/);
      if (domainMatch) {
        const domain = domainMatch[1];
        console.log(`🌐 Counting customers with email domain: ${domain}`);
        
        // Use pagination to get ALL customers with this domain
        const allCustomers = await fetchAllCustomersWithPagination(
          `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json`,
          {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
          { limit: 250 }
        );
        
        const matchingCustomers = allCustomers.filter(customer => 
          customer.email && customer.email.toLowerCase().includes(`@${domain.toLowerCase()}`)
        );
        
        console.log(`📊 Found ${matchingCustomers.length} customers with domain ${domain}`);
        return matchingCustomers.length;
      }
    } else if (segment.criteria.includes('customer_tags')) {
      const tagsMatch = segment.criteria.match(/customer_tags = '([^']+)'/);
      if (tagsMatch) {
        const tags = tagsMatch[1];
        console.log(`🏷️ Counting customers with tags: ${tags}`);
        
        // Use pagination to get ALL customers and filter by tags
        const allCustomers = await fetchAllCustomersWithPagination(
          `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json`,
          {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
          { limit: 250 }
        );
        
        const targetTags = tags.split(',').map(tag => tag.trim());
        const matchingCustomers = allCustomers.filter(customer => {
          const customerTags = customer.tags ? customer.tags.split(',').map(tag => tag.trim()) : [];
          return targetTags.some(tag => customerTags.includes(tag));
        });
        
        console.log(`📊 Found ${matchingCustomers.length} customers with tags ${tags}`);
        return matchingCustomers.length;
      }
    } else if (segment.criteria.includes('rfm_group')) {
      const rfmMatch = segment.criteria.match(/rfm_group = '([^']+)'/);
      if (rfmMatch) {
        const rfmGroup = rfmMatch[1];
        console.log(`🏆 Fetching customers with RFM group: ${rfmGroup}`);
        
        // Approach 1: Try direct segment customers endpoint with pagination (most reliable)
        try {
          console.log(`🔍 Approach 1: Using direct segment customers endpoint with pagination`);
          const segmentId = segment.id.replace('gid://shopify/Segment/', '');
          
          // Use the pagination helper for REST API to get ALL customers
          const allCustomers = await fetchAllCustomersWithPagination(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customer_segments/${segmentId}/customers.json`,
            {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            },
            { limit: 250 }
          );
          
          console.log(`📋 Found ${allCustomers.length} customers via paginated REST segment endpoint`);
          
          if (allCustomers.length > 0) {
            return allCustomers.map(customer => ({
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
          }
        } catch (error) {
          console.log(`❌ Direct segment endpoint approach failed:`, error.message);
        }
        
        // Approach 2: Try GraphQL customerSegmentMembers with pagination
        try {
          console.log(`🔍 Approach 2: Using GraphQL customerSegmentMembers with pagination`);
          const customers = await fetchAllCustomersWithGraphQLPagination(
            `
            query getSegmentMembers($segmentId: ID!, $first: Int!, $after: String) {
              customerSegmentMembers(segmentId: $segmentId, first: $first, after: $after) {
                edges {
                  node {
                    id
                    customer {
                      id
                      firstName
                      lastName
                      email
                      phone
                      createdAt
                      updatedAt
                      tags
                      ordersCount
                      totalSpent
                      addresses {
                        id
                        firstName
                        lastName
                        company
                        address1
                        address2
                        city
                        province
                        country
                        zip
                        phone
                      }
                      note
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
            `,
            { segmentId: segment.id, first: 250 }
          );
          
          console.log(`📋 Found ${customers.length} customers via paginated GraphQL customerSegmentMembers`);
          
          if (customers.length > 0) {
            return customers.map(customer => ({
              id: customer.id.split('/').pop(),
              first_name: customer.firstName || '',
              last_name: customer.lastName || '',
              email: customer.email || '',
              phone: customer.phone || '',
              created_at: customer.createdAt || new Date().toISOString(),
              updated_at: customer.updatedAt || new Date().toISOString(),
              tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : (customer.tags || ''),
              orders_count: customer.ordersCount || 0,
              total_spent: customer.totalSpent || '0.00',
              addresses: customer.addresses || [],
              display_name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
              note: customer.note || ''
            }));
          }
        } catch (error) {
          console.log(`❌ GraphQL customerSegmentMembers approach failed:`, error.message);
        }
        
        // Approach 3: Fallback to RFM calculation (least reliable)
        console.log(`🔍 Approach 3: Using fallback RFM calculation`);
        const customers = await fetchCustomersWithRfmGroupFallback(rfmGroup);
        
        if (customers.length > 0) {
          console.log(`📋 Found ${customers.length} customers via RFM calculation fallback`);
          return customers;
        }
      }
    }
    
    // Fallback: get all customers and count them
    console.log(`🔄 Using fallback approach for segment count`);
    const allCustomers = await fetchAllCustomersWithPagination(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json`,
      {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      { limit: 250 }
    );
    
    const matchingCustomers = allCustomers.filter(customer => {
      return matchesSegmentCriteria(customer, segment.criteria);
    });
    
    console.log(`📊 Segment ${segmentId}: ${matchingCustomers.length} customers (from paginated fetch)`);
    return matchingCustomers.length;

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

// Get customers from a real Shopify segment using simplified approach
async function getCustomersFromShopifySegment(segmentId) {
  try {
    console.log(`🔄 Starting simplified approach for segment: ${segmentId}`);
    
    // Get segment details first
    const segments = await getCustomerSegments();
    const segment = segments.find(s => s.id === segmentId);
    
    if (!segment) {
      console.error(`❌ Segment not found: ${segmentId}`);
      return [];
    }
    
    console.log(`📋 Segment criteria: ${segment.criteria}`);
    
    // Use a simple approach based on criteria type
    if (segment.criteria.includes('customer_email_domain')) {
      const domainMatch = segment.criteria.match(/customer_email_domain = '([^']+)'/);
      if (domainMatch) {
        const domain = domainMatch[1];
        console.log(`📧 Fetching customers with email domain: ${domain}`);
        
        // Use Shopify's customer search by email domain
        const response = await fetch(
          `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=email:*@${domain}`,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            }
          }
        );
        
        if (!response.ok) {
          console.error(`❌ Search API error: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        const customers = data.customers || [];
        
        console.log(`📋 Found ${customers.length} customers with domain ${domain}`);
        
        return customers.map(customer => ({
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
      }
    } else if (segment.criteria.includes('customer_tags')) {
      const tagMatch = segment.criteria.match(/customer_tags CONTAINS '([^']+)'/);
      if (tagMatch) {
        const requiredTag = tagMatch[1];
        console.log(`🏷️ Fetching customers with tag: ${requiredTag}`);
        
        const response = await fetch(
          `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=${encodeURIComponent(requiredTag)}&limit=250`,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            }
          }
        );
        
        if (!response.ok) return [];
        
        const data = await response.json();
        const customers = data.customers || [];
        
        console.log(`📋 Found ${customers.length} customers with tag ${requiredTag}`);
        
        return customers.map(customer => ({
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
      }
    } else if (segment.criteria.includes('rfm_group')) {
      const rfmMatch = segment.criteria.match(/rfm_group = '([^']+)'/);
      if (rfmMatch) {
        const rfmGroup = rfmMatch[1];
        console.log(`🏆 Fetching customers with RFM group: ${rfmGroup}`);
        
        // Try multiple approaches for RFM groups based on Shopify documentation
        
        // Approach 1: Try Shopify's customer search API with RFM group
        try {
          console.log(`🔍 Approach 1: Using customer search API with RFM group`);
          const searchResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/search.json?query=rfm_group:${rfmGroup}`,
            {
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              }
            }
          );
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const customers = searchData.customers || [];
            console.log(`📋 Found ${customers.length} customers via search API`);
            
            if (customers.length > 0) {
              return customers.map(customer => ({
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
            }
          }
        } catch (error) {
          console.log(`❌ Search API approach failed:`, error.message);
        }
        
        // Approach 2: Try GraphQL with customer segment query
        try {
          console.log(`🔍 Approach 2: Using GraphQL customer segment query`);
          const graphqlQuery = `
            query getCustomersBySegment($segmentId: ID!, $first: Int!) {
              customerSegment(id: $segmentId) {
                id
                name
                customers(first: $first) {
                  edges {
                    node {
                      id
                      firstName
                      lastName
                      email
                      phone
                      createdAt
                      updatedAt
                      tags
                      ordersCount
                      totalSpent
                      addresses {
                        id
                        firstName
                        lastName
                        company
                        address1
                        address2
                        city
                        province
                        country
                        zip
                        phone
                      }
                      note
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
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
                query: graphqlQuery,
                variables: {
                  segmentId: segmentId,
                  first: 250
                }
              })
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            
            if (!data.errors && data.data?.customerSegment?.customers) {
              const customers = data.data.customerSegment.customers.edges.map(edge => edge.node);
              console.log(`📋 Found ${customers.length} customers via GraphQL segment query`);
              
              if (customers.length > 0) {
                return customers.map(customer => ({
                  id: customer.id.split('/').pop(),
                  first_name: customer.firstName || '',
                  last_name: customer.lastName || '',
                  email: customer.email || '',
                  phone: customer.phone || '',
                  created_at: customer.createdAt || new Date().toISOString(),
                  updated_at: customer.updatedAt || new Date().toISOString(),
                  tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : (customer.tags || ''),
                  orders_count: customer.ordersCount || 0,
                  total_spent: customer.totalSpent || '0.00',
                  addresses: customer.addresses || [],
                  display_name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
                  note: customer.note || ''
                }));
              }
            }
          }
        } catch (error) {
          console.log(`❌ GraphQL segment approach failed:`, error.message);
        }
        
        // Approach 3: Try REST API with customer segment endpoint
        try {
          console.log(`🔍 Approach 3: Using REST API customer segment endpoint`);
          const segmentId = segment.id.replace('gid://shopify/Segment/', '');
          const segmentResponse = await fetch(
            `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customer_segments/${segmentId}/customers.json`,
            {
              headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              }
            }
          );
          
          if (segmentResponse.ok) {
            const segmentData = await segmentResponse.json();
            const customers = segmentData.customers || [];
            console.log(`📋 Found ${customers.length} customers via REST segment endpoint`);
            
            if (customers.length > 0) {
              return customers.map(customer => ({
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
            }
          }
        } catch (error) {
          console.log(`❌ REST segment endpoint approach failed:`, error.message);
        }
        
        // Approach 4: Try GraphQL with customer query and RFM filter
        try {
          console.log(`🔍 Approach 4: Using GraphQL customer query with RFM filter`);
          const graphqlQuery = `
            query getCustomersWithRfmFilter($first: Int!) {
              customers(first: $first, query: "rfm_group:${rfmGroup}") {
                edges {
                  node {
                    id
                    firstName
                    lastName
                    email
                    phone
                    createdAt
                    updatedAt
                    tags
                    ordersCount
                    totalSpent
                    addresses {
                      id
                      firstName
                      lastName
                      company
                      address1
                      address2
                      city
                      province
                      country
                      zip
                      phone
                    }
                    note
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
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
                query: graphqlQuery,
                variables: {
                  first: 250
                }
              })
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            
            if (!data.errors && data.data?.customers) {
              const customers = data.data.customers.edges.map(edge => edge.node);
              console.log(`📋 Found ${customers.length} customers via GraphQL RFM filter`);
              
              if (customers.length > 0) {
                return customers.map(customer => ({
                  id: customer.id.split('/').pop(),
                  first_name: customer.firstName || '',
                  last_name: customer.lastName || '',
                  email: customer.email || '',
                  phone: customer.phone || '',
                  created_at: customer.createdAt || new Date().toISOString(),
                  updated_at: customer.updatedAt || new Date().toISOString(),
                  tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : (customer.tags || ''),
                  orders_count: customer.ordersCount || 0,
                  total_spent: customer.totalSpent || '0.00',
                  addresses: customer.addresses || [],
                  display_name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
                  note: customer.note || ''
                }));
              }
            }
          }
        } catch (error) {
          console.log(`❌ GraphQL RFM filter approach failed:`, error.message);
        }
        
        // Approach 5: Fallback to REST API with custom RFM calculation
        console.log(`🔍 Using fallback REST API with custom RFM calculation`);
        return await fetchCustomersWithRfmGroupFallback(rfmGroup);
      }
    }
    
    // Fallback to the original REST API approach for other criteria
    console.log(`🔄 Using fallback REST API approach for criteria: ${segment.criteria}`);
    
    // Use the new pagination helper to fetch ALL customers
    const allCustomers = await fetchAllCustomersWithPagination(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json`,
      {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
      { limit: 250 }
    );
    
    console.log(`📋 Retrieved ${allCustomers.length} total customers from Shopify`);
    
    // Filter customers based on segment criteria
    const filteredCustomers = allCustomers.filter(customer => {
      return matchesSegmentCriteria(customer, segment.criteria);
    });
    
    console.log(`🔍 Filtered ${filteredCustomers.length} customers matching criteria`);
    
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
    
    console.log(`✅ Successfully processed ${processedCustomers.length} customers matching segment criteria`);
    return processedCustomers;
    
  } catch (error) {
    console.error(`💥 Critical error getting customers from Shopify segment ${segmentId}:`, error);
    return [];
  }
}

// Fallback function for RFM groups using REST API with filtering
async function fetchCustomersWithRfmGroupFallback(rfmGroup) {
  console.log(`🔄 Using fallback REST API approach for RFM group: ${rfmGroup}`);
  
  // Use the new pagination helper to fetch ALL customers
  const allCustomers = await fetchAllCustomersWithPagination(
    `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json`,
    {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    { limit: 250 }
  );
  
  console.log(`📋 Retrieved ${allCustomers.length} total customers from Shopify`);
  
  // For RFM groups, we need to calculate the RFM score for each customer
  const filteredCustomers = allCustomers.filter(customer => {
    const orders = customer.orders_count || 0;
    const totalSpent = parseFloat(customer.total_spent || '0');
    
    // Simple RFM logic for CHAMPIONS group (high frequency, high monetary value)
    if (rfmGroup === 'CHAMPIONS') {
      return orders >= 5 && totalSpent >= 500; // Example criteria for champions
    } else if (rfmGroup === 'LOYAL_CUSTOMERS') {
      return orders >= 3 && totalSpent >= 200;
    } else if (rfmGroup === 'AT_RISK') {
      return orders >= 1 && totalSpent >= 50;
    } else if (rfmGroup === 'CANT_LOSE') {
      return orders === 0 || totalSpent < 50;
    }
    
    return false;
  });
  
  console.log(`🔍 Filtered ${filteredCustomers.length} customers matching RFM group ${rfmGroup}`);
  
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
  
  console.log(`✅ Successfully processed ${processedCustomers.length} customers for RFM group ${rfmGroup}`);
  return processedCustomers;
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
    
    if (criteria.includes('customer_tags')) {
      const tagMatch = criteria.match(/customer_tags CONTAINS '([^']+)'/);
      if (tagMatch) {
        const requiredTag = tagMatch[1];
        const customerTags = customer.tags || '';
        const matches = customerTags.includes(requiredTag);
        console.log(`🏷️ Tag check: "${customerTags}" contains "${requiredTag}" = ${matches}`);
        return matches;
      }
    }
    
    if (criteria.includes('rfm_group =')) {
      const rfmMatch = criteria.match(/rfm_group = '([^']+)'/);
      if (rfmMatch) {
        const requiredRfmGroup = rfmMatch[1];
        
        // RFM groups are calculated based on customer behavior, not stored as tags
        // This is a simplified RFM calculation - in practice, this would be more sophisticated
        const orders = customer.orders_count || 0;
        const totalSpent = parseFloat(customer.total_spent || '0');
        
        let matches = false;
        if (requiredRfmGroup === 'CHAMPIONS') {
          // Champions: High frequency, high monetary value customers
          matches = orders >= 5 && totalSpent >= 500;
        } else if (requiredRfmGroup === 'LOYAL') {
          // Loyal: Regular customers with good spending
          matches = orders >= 3 && totalSpent >= 200;
        } else if (requiredRfmGroup === 'AT_RISK') {
          // At Risk: Customers who haven't ordered recently
          matches = orders >= 1 && totalSpent >= 50;
        } else if (requiredRfmGroup === 'NEW') {
          // New: Recent customers with few orders
          matches = orders <= 2 && totalSpent <= 100;
        }
        
        console.log(`🏆 RFM group check: orders=${orders}, spent=${totalSpent}, group=${requiredRfmGroup} = ${matches}`);
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

// Debug endpoint for Champions segment
app.get('/api/debug/champions', requireAuth, async (req, res) => {
  try {
    const segmentId = req.query.segmentId;
    if (!segmentId) {
      return res.json({ error: 'Missing segmentId parameter' });
    }
    
    console.log('=== CHAMPIONS DEBUG for segment:', segmentId, '===');
    
    // Test 1: Get segment details
    const segmentQuery = `
      query getSegment($id: ID!) {
        segment(id: $id) {
          id
          name
          query
          creationDate
          lastEditDate
        }
      }
    `;
    
    const segmentResponse = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: segmentQuery,
          variables: { id: segmentId }
        })
      }
    );
    
    const segmentData = await segmentResponse.json();
    
    // Test 2: Try customerSegmentMembers
    const membersQuery = `
      query getSegmentMembers($id: ID!, $first: Int!) {
        customerSegmentMembers(segmentId: $id, first: $first) {
          edges {
            node {
              id
              customer {
                id
                firstName
                lastName
                email
                numberOfOrders
                tags
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    
    const membersResponse = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: membersQuery,
          variables: { id: segmentId, first: 250 }
        })
      }
    );
    
    const membersData = await membersResponse.json();
    
    res.json({
      segmentId,
      timestamp: new Date().toISOString(),
      segmentDetails: {
        success: segmentResponse.ok,
        data: segmentData,
        segment: segmentData.data?.segment
      },
      segmentMembers: {
        success: membersResponse.ok,
        memberCount: membersData.data?.customerSegmentMembers?.edges?.length || 0,
        data: membersData,
        pageInfo: membersData.data?.customerSegmentMembers?.pageInfo
      }
    });
    
  } catch (error) {
    console.error('Champions debug error:', error);
    res.status(500).json({
      error: 'Champions debug failed',
      details: error.message
    });
  }
});

// Simple test endpoint for Champions segment (no auth required for debugging)
app.get('/api/test-champions', async (req, res) => {
  try {
    const segmentId = 'gid://shopify/Segment/527400370400';
    console.log('=== CHAMPIONS TEST (no auth) for segment:', segmentId, '===');
    
    // Test 1: Get segment details
    const segmentQuery = `
      query getSegment($id: ID!) {
        segment(id: $id) {
          id
          name
          query
          creationDate
          lastEditDate
        }
      }
    `;
    
    const segmentResponse = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: segmentQuery,
          variables: { id: segmentId }
        })
      }
    );
    
    const segmentData = await segmentResponse.json();
    
    // Test 2: Try customerSegmentMembers
    const membersQuery = `
      query getSegmentMembers($id: ID!, $first: Int!) {
        customerSegmentMembers(segmentId: $id, first: $first) {
          edges {
            node {
              id
              customer {
                id
                firstName
                lastName
                email
                numberOfOrders
                tags
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    
    const membersResponse = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: membersQuery,
          variables: { id: segmentId, first: 250 }
        })
      }
    );
    
    const membersData = await membersResponse.json();
    
    res.json({
      segmentId,
      timestamp: new Date().toISOString(),
      segmentDetails: {
        success: segmentResponse.ok,
        data: segmentData,
        segment: segmentData.data?.segment,
        errors: segmentData.errors
      },
      segmentMembers: {
        success: membersResponse.ok,
        memberCount: membersData.data?.customerSegmentMembers?.edges?.length || 0,
        data: membersData,
        pageInfo: membersData.data?.customerSegmentMembers?.pageInfo,
        errors: membersData.errors
      }
    });
    
  } catch (error) {
    console.error('Champions test error:', error);
    res.status(500).json({
      error: 'Champions test failed',
      details: error.message
    });
  }
});

// Debug endpoint to test direct segment customers endpoint
app.get('/api/debug/segment-customers', requireAuth, async (req, res) => {
  try {
    const { segmentId } = req.query;
    
    if (!segmentId) {
      return res.status(400).json({ error: 'Segment ID is required' });
    }
    
    console.log(`🔍 Testing direct segment customers endpoint for: ${segmentId}`);
    
    // Extract numeric ID from GID
    const numericId = segmentId.replace('gid://shopify/Segment/', '');
    console.log(`📋 Using numeric ID: ${numericId}`);
    
    // Test the direct segment customers endpoint
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customer_segments/${numericId}/customers.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        }
      }
    );
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error response: ${errorText}`);
      return res.status(response.status).json({
        error: `Shopify API error: ${response.status}`,
        details: errorText
      });
    }
    
    const data = await response.json();
    const customers = data.customers || [];
    
    console.log(`📋 Found ${customers.length} customers in first page`);
    
    // Check if there are more pages
    const linkHeader = response.headers.get('Link');
    const hasNextPage = linkHeader && linkHeader.includes('rel="next"');
    
    res.json({
      success: true,
      segmentId: segmentId,
      numericId: numericId,
      customerCount: customers.length,
      hasNextPage: hasNextPage,
      linkHeader: linkHeader,
      firstCustomer: customers[0] ? {
        id: customers[0].id,
        email: customers[0].email,
        orders_count: customers[0].orders_count,
        total_spent: customers[0].total_spent
      } : null,
      sampleCustomers: customers.slice(0, 3).map(c => ({
        id: c.id,
        email: c.email,
        orders_count: c.orders_count,
        total_spent: c.total_spent
      }))
    });
    
  } catch (error) {
    console.error('Error testing segment customers endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Start the server
startServer();

export default app; 