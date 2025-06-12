interface Env {
	SHOPIFY_STORE_URL: string;
	SHOPIFY_ACCESS_TOKEN: string;
}

interface ShopifyCustomer {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	tags: string;
}

interface CustomerSegment {
	id: string;
	name: string;
	customerCount: number;
	lastSync: string;
}

interface TaggingRule {
	id: string;
	name: string;
	isActive: boolean;
	triggerSegment: string;
	actions: {
		type: 'add' | 'remove';
		tag: string;
	}[];
	createdAt: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Handle CORS
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// API Routes
			if (path.startsWith('/api/segments')) {
				return handleSegments(request, env, corsHeaders);
			}
			
			if (path.startsWith('/api/customers')) {
				return handleCustomers(request, env, corsHeaders);
			}
			
			if (path.startsWith('/api/bulk-tag')) {
				return handleBulkTag(request, env, corsHeaders);
			}
			
			if (path.startsWith('/api/rules')) {
				return handleRules(request, env, corsHeaders);
			}

			// Return 404 for other API routes
			if (path.startsWith('/api/')) {
				return new Response('Not Found', { status: 404, headers: corsHeaders });
			}

			// Serve static files (handled by Cloudflare Pages)
			return new Response('Static files handled by Pages', { status: 404 });
		} catch (error) {
			console.error('Worker error:', error);
			return new Response('Internal Server Error', { 
				status: 500, 
				headers: corsHeaders 
			});
		}
	},
};

async function handleSegments(request: Request, env: Env, corsHeaders: Record<string, string>) {
	if (request.method === 'GET') {
		// Fetch customer segments from Shopify
		const segments = await getCustomerSegments(env);
		return new Response(JSON.stringify(segments), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
	
	return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleCustomers(request: Request, env: Env, corsHeaders: Record<string, string>) {
	const url = new URL(request.url);
	const segmentName = url.searchParams.get('segment');
	
	if (request.method === 'GET' && segmentName) {
		const customers = await getCustomersBySegment(env, segmentName);
		return new Response(JSON.stringify(customers), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
	
	return new Response('Method not allowed or missing segment parameter', { 
		status: 405, 
		headers: corsHeaders 
	});
}

async function handleBulkTag(request: Request, env: Env, corsHeaders: Record<string, string>) {
	if (request.method === 'POST') {
		const body = await request.json() as {
			customerIds: string[];
			actions: { type: 'add' | 'remove'; tag: string }[];
		};
		
		const result = await applyBulkTags(env, body.customerIds, body.actions);
		return new Response(JSON.stringify(result), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
	
	return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function handleRules(request: Request, env: Env, corsHeaders: Record<string, string>) {
	if (request.method === 'POST') {
		const rule = await request.json() as TaggingRule;
		const result = await executeTaggingRule(env, rule);
		return new Response(JSON.stringify(result), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
	
	return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

async function getCustomerSegments(env: Env): Promise<CustomerSegment[]> {
	// For now, we'll simulate segments based on customer tags and behavior
	// In a real implementation, you might use Shopify's Customer Saved Searches
	const segments: CustomerSegment[] = [
		{
			id: 'vip',
			name: 'VIP Customers',
			customerCount: await getCustomerCountByTag(env, 'VIP'),
			lastSync: new Date().toISOString()
		},
		{
			id: 'vvip',
			name: 'VVIP Customers', 
			customerCount: await getCustomerCountByTag(env, 'VVIP'),
			lastSync: new Date().toISOString()
		},
		{
			id: 'new',
			name: 'New Customers',
			customerCount: await getNewCustomerCount(env),
			lastSync: new Date().toISOString()
		},
		{
			id: 'repeat',
			name: 'Repeat Buyers',
			customerCount: await getRepeatBuyerCount(env),
			lastSync: new Date().toISOString()
		}
	];
	
	return segments;
}

async function getCustomerCountByTag(env: Env, tag: string): Promise<number> {
	const response = await fetch(
		`${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=${encodeURIComponent(tag)}&limit=1`,
		{
			headers: {
				'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!response.ok) return 0;
	
	const data = await response.json();
	return data.customers?.length || 0;
}

async function getNewCustomerCount(env: Env): Promise<number> {
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	
	const response = await fetch(
		`${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`,
		{
			headers: {
				'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!response.ok) return 0;
	
	const data = await response.json();
	return data.customers?.length || 0;
}

async function getRepeatBuyerCount(env: Env): Promise<number> {
	// This would require more complex logic to identify repeat buyers
	// For now, return a placeholder
	return 150;
}

async function getCustomersBySegment(env: Env, segmentName: string): Promise<ShopifyCustomer[]> {
	let endpoint = '';
	
	switch (segmentName) {
		case 'VIP Customers':
			endpoint = `${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VIP&limit=250`;
			break;
		case 'VVIP Customers':
			endpoint = `${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?tags=VVIP&limit=250`;
			break;
		case 'New Customers':
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			endpoint = `${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?created_at_min=${thirtyDaysAgo.toISOString()}&limit=250`;
			break;
		default:
			return [];
	}

	const response = await fetch(endpoint, {
		headers: {
			'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) return [];
	
	const data = await response.json();
	return data.customers || [];
}

async function applyBulkTags(
	env: Env, 
	customerIds: string[], 
	actions: { type: 'add' | 'remove'; tag: string }[]
): Promise<{ success: number; failed: number; errors: string[] }> {
	const results = { success: 0, failed: 0, errors: [] as string[] };

	for (const customerId of customerIds) {
		try {
			// Get current customer data
			const customerResponse = await fetch(
				`${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/${customerId}.json`,
				{
					headers: {
						'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
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
			const currentTags = customerData.customer.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean);
			
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
				`${env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers/${customerId}.json`,
				{
					method: 'PUT',
					headers: {
						'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
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
			results.errors.push(`Error processing customer ${customerId}: ${error}`);
		}
	}

	return results;
}

async function executeTaggingRule(env: Env, rule: TaggingRule) {
	// Get customers from the trigger segment
	const customers = await getCustomersBySegment(env, rule.triggerSegment);
	const customerIds = customers.map(customer => customer.id);
	
	// Apply the rule actions to all customers in the segment
	const result = await applyBulkTags(env, customerIds, rule.actions);
	
	return {
		rule: rule.name,
		customersProcessed: customerIds.length,
		...result
	};
}
