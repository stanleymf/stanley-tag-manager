const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

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

// API Routes
app.get('/api/segments', handleSegments);
app.get('/api/customers', handleCustomers);
app.post('/api/bulk-tag', handleBulkTag);
app.post('/api/rules', handleRules);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/client/index.html'));
});

// API Handler Functions
async function handleSegments(req, res) {
  try {
    const segments = await getCustomerSegments();
    res.json(segments);
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
}

async function handleCustomers(req, res) {
  try {
    const segmentName = req.query.segment;
    
    if (!segmentName) {
      return res.status(400).json({ error: 'Segment parameter is required' });
    }
    
    const customers = await getCustomersBySegment(segmentName);
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
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
  const segments = [
    {
      id: 'vip',
      name: 'VIP Customers',
      customerCount: await getCustomerCountByTag('VIP'),
      lastSync: new Date().toISOString()
    },
    {
      id: 'vvip',
      name: 'VVIP Customers', 
      customerCount: await getCustomerCountByTag('VVIP'),
      lastSync: new Date().toISOString()
    },
    {
      id: 'new',
      name: 'New Customers',
      customerCount: await getNewCustomerCount(),
      lastSync: new Date().toISOString()
    },
    {
      id: 'repeat',
      name: 'Repeat Buyers',
      customerCount: await getRepeatBuyerCount(),
      lastSync: new Date().toISOString()
    }
  ];
  
  return segments;
}

async function getCustomerCountByTag(tag) {
  try {
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=${encodeURIComponent(tag)}&limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) return 0;
    
    const data = await response.json();
    return data.customers?.length || 0;
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
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) return 0;
    
    const data = await response.json();
    return data.customers?.length || 0;
  } catch (error) {
    console.error('Error getting new customer count:', error);
    return 0;
  }
}

async function getRepeatBuyerCount() {
  // Placeholder - would require more complex logic to identify repeat buyers
  return 150;
}

async function getCustomersBySegment(segmentName) {
  let endpoint = '';
  
  switch (segmentName) {
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
    console.error('Error getting customers by segment:', error);
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

module.exports = app; 