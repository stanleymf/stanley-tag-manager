# Stanley Tag Manager - Deployment Guide

## Prerequisites

1. **Shopify Store** with admin access
2. **Cloudflare Account** for deployment
3. **Node.js 18+** and **pnpm** installed locally

## Step 1: Shopify Setup

### Create a Private App

1. Go to your Shopify Admin panel
2. Navigate to **Apps and sales channels** > **Develop apps**
3. Click **Create an app**
4. Give it a name like "Customer Tag Manager"
5. Click **Configure Admin API scopes**
6. Enable the following scopes:
   - `read_customers` - Read customer data and segments
   - `write_customers` - Update customer tags
7. Click **Save**
8. Click **Install app**
9. Copy the **Admin API access token** (starts with `shpat_`)

### Get Your Store URL

Your store URL should be in the format: `https://your-store-name.myshopify.com`

## Step 2: Configure Environment Variables

### For Cloudflare Workers

The app uses Cloudflare Workers environment variables. You'll need to set these:

```bash
# Set environment variables in Cloudflare
wrangler secret put SHOPIFY_STORE_URL
# Enter: https://your-store-name.myshopify.com

wrangler secret put SHOPIFY_ACCESS_TOKEN  
# Enter: shpat_your_access_token_here
```

### For Local Development

Create a `.dev.vars` file in the root directory:

```
SHOPIFY_STORE_URL=https://your-store-name.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_access_token_here
```

## Step 3: Deploy to Cloudflare

### Install Dependencies

```bash
pnpm install
```

### Build and Deploy

```bash
# Build the application
pnpm build

# Deploy to Cloudflare Workers + Pages
pnpm deploy
```

### Alternative: Deploy via Wrangler CLI

```bash
# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy
```

## Step 4: Configure Cloudflare Dashboard

1. Go to **Cloudflare Dashboard** > **Workers & Pages**
2. Find your deployed worker
3. Go to **Settings** > **Environment Variables**
4. Add the following variables:
   - `SHOPIFY_STORE_URL`: `https://your-store-name.myshopify.com`
   - `SHOPIFY_ACCESS_TOKEN`: `shpat_your_access_token_here`

## Step 5: Test the Integration

1. Open your deployed application URL
2. Go to **Customer Segments** - you should see your Shopify customer data
3. Create a **Tagging Rule** using one of your segments
4. Use **Bulk Tagger** to manually tag customers
5. Execute rules to automate tagging

## Troubleshooting

### Common Issues

**"Failed to load segments"**
- Check your Shopify store URL format
- Verify your access token is correct
- Ensure the Private App has `read_customers` scope

**"Failed to apply tags"**
- Verify the access token has `write_customers` scope
- Check that the Private App is installed and active

**CORS Errors**
- The worker handles CORS automatically
- If you see CORS errors, check the worker deployment

### Check Logs

View deployment logs:
```bash
wrangler tail
```

### Local Development

Run locally for testing:
```bash
# Start the development server
pnpm dev

# In another terminal, start the worker
wrangler dev worker/index.ts
```

## API Endpoints

Once deployed, your worker provides these endpoints:

- `GET /api/segments` - Get customer segments
- `GET /api/customers?segment=SegmentName` - Get customers in a segment
- `POST /api/bulk-tag` - Apply bulk tags to customers
- `POST /api/rules` - Execute a tagging rule

## Security Notes

- Keep your Shopify access token secure
- Never commit access tokens to version control
- Use Cloudflare's encrypted environment variables
- Regularly rotate your access tokens
- Monitor API usage in Shopify admin

## Scaling Considerations

- **Rate Limits**: Shopify has API rate limits (40 requests/second)
- **Bulk Operations**: The worker processes customers sequentially to respect rate limits
- **Customer Count**: For stores with 10,000+ customers, consider implementing pagination
- **Background Jobs**: For very large operations, consider using Cloudflare Workers with Durable Objects

## Support

For issues with:
- **Shopify API**: Check [Shopify API documentation](https://shopify.dev/api/admin-rest)
- **Cloudflare Workers**: Check [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- **This Application**: Create an issue in the repository 