import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';

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

// Cache for segments
let segmentsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Authentication configuration
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'windflower2024';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Simple session store (in production, use Redis or proper session store)
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

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, { username, createdAt: Date.now() });
    
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
app.post('/api/rules', requireAuth, handleRules);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    shopifyConfigured: !!(process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN),
    storeUrl: process.env.SHOPIFY_STORE_URL ? 'configured' : 'missing',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'missing'
  });
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

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/client/index.html'));
});

// API Handler Functions
async function handleSegments(req, res) {
  try {
    console.log('=== SEGMENTS API CALLED ===');
    
    // Check if we have cached segments and they're still fresh
    const now = Date.now();
    if (segmentsCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
      console.log('Returning cached segments');
      return res.json(segmentsCache);
    }
    
    // Fetch fresh segments
    const segments = await getCustomerSegments();
    
    // Update cache
    segmentsCache = segments;
    cacheTimestamp = now;
    
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
    
    // Clear cache to force fresh fetch
    segmentsCache = null;
    cacheTimestamp = null;
    
    // Fetch fresh segments from Shopify
    const segments = await getCustomerSegments();
    
    // Update cache
    segmentsCache = segments;
    cacheTimestamp = Date.now();
    
    console.log(`Synced ${segments.length} segments from Shopify`);
    res.json({ 
      success: true, 
      message: `Successfully synced ${segments.length} segments from Shopify`,
      segments: segments,
      syncedAt: new Date().toISOString()
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

async function handleRules(req, res) {
  try {
    const rule = req.body;
    const result = await executeTaggingRule(rule);
    res.json(result);
  } catch (error) {
    console.error('Error executing rule:', error);
    res.status(500).json({ error: 'Failed to execute rule' });
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
    // Fetch real Shopify customer segments using GraphQL
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
          variables: { first: 100 }
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
    console.log('GraphQL Response:', JSON.stringify(data, null, 2));

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

    // Convert Shopify segments to our format and get customer counts
    const segments = await Promise.all(
      shopifySegments.map(async (edge) => {
        const segment = edge.node;
        const customerCount = await getSegmentCustomerCount(segment.id);
        
        return {
          id: segment.id,
          name: segment.name,
          criteria: segment.query || 'Shopify defined segment',
          customerCount,
          lastSync: new Date().toISOString(),
          description: `Segment: ${segment.name}`,
          createdAt: segment.creationDate,
          updatedAt: segment.lastEditDate
        };
      })
    );

    // Add "All Customers" as the first segment if not present
    const hasAllCustomers = segments.some(s => s.name.toLowerCase().includes('all'));
    if (!hasAllCustomers) {
      const allCustomersSegment = {
        id: 'all-customers',
        name: 'All Customers',
        criteria: 'All registered customers',
        customerCount: await getAllCustomerCount(),
        lastSync: new Date().toISOString(),
        description: 'Complete customer base'
      };
      segments.unshift(allCustomersSegment);
    }

    console.log('Final segments:', segments.map(s => `${s.name}: ${s.customerCount}`));
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
    const query = `
      query getSegmentMembers($segmentId: ID!, $first: Int!) {
        customerSegmentMembers(segmentId: $segmentId, first: $first) {
          totalCount
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
          variables: { segmentId, first: 1 }
        })
      }
    );

    if (!response.ok) {
      console.log(`Failed to get count for segment ${segmentId}`);
      return 0;
    }

    const data = await response.json();
    const totalCount = data.data?.customerSegmentMembers?.totalCount || 0;
    console.log(`Segment ${segmentId} has ${totalCount} customers`);
    return totalCount;

  } catch (error) {
    console.error(`Error getting segment customer count for ${segmentId}:`, error);
    return 0;
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

// Get customers from a real Shopify segment using GraphQL
async function getCustomersFromShopifySegment(segmentId) {
  try {
    console.log(`Fetching customers for Shopify segment: ${segmentId}`);
    
    const query = `
      query getSegmentMembers($segmentId: ID!, $first: Int!) {
        customerSegmentMembers(segmentId: $segmentId, first: $first) {
          edges {
            node {
              id
              firstName
              lastName
              displayName
              defaultEmailAddress {
                emailAddress
              }
              numberOfOrders
              amountSpent {
                amount
                currencyCode
              }
              defaultAddress {
                city
                country
                address1
                address2
                province
                zip
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
          query,
          variables: { segmentId, first: 250 }
        })
      }
    );

    console.log(`GraphQL response status for segment ${segmentId}:`, response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get customers for segment ${segmentId}:`, errorText);
      return [];
    }

    const data = await response.json();
    console.log(`GraphQL response for segment ${segmentId}:`, JSON.stringify(data, null, 2));
    
    if (data.errors) {
      console.error('GraphQL errors for segment members:', data.errors);
      return [];
    }

    const customers = data.data?.customerSegmentMembers?.edges?.map(edge => {
      const customer = edge.node;
      console.log(`Processing customer:`, customer);
      
      return {
        id: customer.id.split('/').pop(), // Extract numeric ID
        first_name: customer.firstName || '',
        last_name: customer.lastName || '',
        email: customer.defaultEmailAddress?.emailAddress || '',
        created_at: new Date().toISOString(), // CustomerSegmentMember doesn't have creation date
        updated_at: new Date().toISOString(),
        tags: '', // CustomerSegmentMember doesn't have tags directly
        orders_count: customer.numberOfOrders || 0,
        total_spent: customer.amountSpent?.amount || '0.00',
        addresses: customer.defaultAddress ? [customer.defaultAddress] : [],
        display_name: customer.displayName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        note: customer.note || ''
      };
    }) || [];

    console.log(`Successfully retrieved ${customers.length} customers from Shopify segment ${segmentId}`);
    return customers;

  } catch (error) {
    console.error(`Error getting customers from Shopify segment ${segmentId}:`, error);
    return [];
  }
}

// Fallback function for basic segments using REST API
async function getCustomersFromBasicSegment(segmentName) {
  let endpoint = '';
  
  switch (segmentName) {
    case 'All Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=250`;
      break;
    case 'VIP Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VIP&limit=250`;
      break;
    case 'VVIP Customers':
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VVIP&limit=250`;
      break;
    case 'New Customers':
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      endpoint = `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Stanley Tag Manager running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏪 Shopify Store: ${process.env.SHOPIFY_STORE_URL || 'Not configured'}`);
});

export default app; 