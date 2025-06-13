# Stanley Tag Manager

A powerful customer tagging automation tool for Shopify stores, built with React, TypeScript, and Cloudflare Workers.

## 🚀 Features

### Customer Segment Management
- **Real-time Sync**: Connect directly to your Shopify store to fetch customer segments
- **Segment Overview**: View customer counts and sync status for each segment
- **Smart Segmentation**: Automatically categorize customers by tags, purchase behavior, and signup date

### Automated Tagging Rules
- **Rule Engine**: Create sophisticated tagging rules with multiple conditions
- **Trigger-based Actions**: Set rules to fire when customers join specific segments
- **Bulk Operations**: Add or remove tags from entire customer segments at once
- **Rule Management**: Enable/disable rules, edit conditions, and track execution

### Bulk Tag Manager
- **Visual Customer Selection**: Browse customers in any segment with easy selection interface
- **Batch Processing**: Apply tags to hundreds of customers simultaneously
- **Progress Tracking**: Monitor success/failure rates for bulk operations
- **Tag Preview**: See current tags on customers before making changes

### Modern UI/UX
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Real-time Updates**: See changes reflected immediately across the interface
- **Intuitive Navigation**: Clean, organized interface for efficient workflow
- **Error Handling**: Comprehensive error messages and retry functionality

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **Backend**: Cloudflare Workers
- **API**: Shopify Admin REST API
- **Deployment**: Cloudflare Pages + Workers
- **Build Tool**: Vite
- **Package Manager**: pnpm

## 📋 Prerequisites

- Shopify store with admin access
- Cloudflare account (free tier works)
- Node.js 18+ and pnpm installed

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd stanley-tag-manager
pnpm install
```

### 2. Set Up Shopify Integration

1. Go to your Shopify Admin → Apps and sales channels → Develop apps
2. Create a new app called "Customer Tag Manager"
3. Configure Admin API scopes:
   - `read_customers` - Read customer data
   - `write_customers` - Update customer tags
4. Install the app and copy the access token

### 3. Configure Environment

Copy `.dev.vars.example` to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your Shopify credentials:

```
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_token_here
```

### 4. Run Locally

```bash
# Start the frontend
pnpm dev

# In another terminal, start the worker
wrangler dev worker/index.ts
```

Visit `http://localhost:4321` to see your tag manager!

## 🌐 Deployment

### Deploy to Railway (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/stanley-tag-manager.git
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Go to [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `stanley-tag-manager` repository
   - Railway will auto-detect Node.js and deploy

3. **Set Environment Variables**:
   In Railway dashboard → Variables:
   ```
   SHOPIFY_STORE_URL=https://your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=shpat_your_token_here
   NODE_ENV=production
   ```

### Alternative: Deploy to Cloudflare

```bash
# Login to Cloudflare
wrangler login

# Set environment variables
wrangler secret put SHOPIFY_STORE_URL
wrangler secret put SHOPIFY_ACCESS_TOKEN

# Deploy
pnpm deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 📖 Usage Guide

### Creating Your First Tagging Rule

1. **Navigate to Tagging Rules** → Click "Create Rule"
2. **Set Trigger**: Choose a customer segment (e.g., "VIP Customers")
3. **Define Actions**: Add tags like "VIP" or remove tags like "Regular"
4. **Activate Rule**: Toggle the rule active and save
5. **Execute**: Use the dropdown menu to run the rule immediately

### Bulk Tagging Customers

1. **Go to Bulk Tagger** → Select a customer segment
2. **Choose Action**: Add or remove tags
3. **Enter Tag Name**: Type the tag you want to apply
4. **Select Customers**: Use checkboxes to choose specific customers
5. **Execute**: Click "Add Tag" or "Remove Tag" to process

### Managing Customer Segments

1. **Dashboard View**: See all your segments with customer counts
2. **Sync Data**: Click "Sync Segments" to refresh from Shopify
3. **Monitor Status**: Check last sync times and segment health

## 🔧 API Endpoints

The Cloudflare Worker provides these REST endpoints:

- `GET /api/segments` - List all customer segments
- `GET /api/customers?segment=SegmentName` - Get customers in segment
- `POST /api/bulk-tag` - Apply tags to multiple customers
- `POST /api/rules` - Execute a tagging rule

## 🔒 Security

- All Shopify credentials are encrypted in Cloudflare Workers
- API requests use HTTPS and proper authentication
- No customer data is stored permanently
- Access tokens are never exposed in frontend code

## 📊 Performance

- **Fast Loading**: Leverages Cloudflare's global edge network
- **Rate Limiting**: Respects Shopify's API limits (40 req/sec)
- **Efficient Batching**: Groups operations to minimize API calls
- **Error Recovery**: Automatically retries failed operations

## 🐛 Troubleshooting

### Common Issues

**"Failed to load segments"**
- Verify your Shopify store URL format
- Check that your access token is valid
- Ensure the Private App has correct scopes

**"Failed to apply tags"**
- Confirm `write_customers` scope is enabled
- Check that the Private App is active
- Verify customer IDs are valid

**Rate Limit Errors**
- The app automatically handles rate limits
- For large operations, consider smaller batches

### Debug Mode

Enable debug logging:

```bash
wrangler tail
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Shopify Admin API](https://shopify.dev/api/admin)
- Powered by [Cloudflare Workers](https://workers.cloudflare.com/)
- UI components from [Radix UI](https://www.radix-ui.com/)
- Icons from [Lucide React](https://lucide.dev/)

## 📞 Support

For support and questions:
- Check the [Troubleshooting Guide](./DEPLOYMENT.md#troubleshooting)
- Review [Shopify API documentation](https://shopify.dev/api/admin-rest)
- Open an issue in this repository

---

**Happy Tagging! 🏷️** # Redeploy trigger - Fri Jun 13 13:08:52 +08 2025
