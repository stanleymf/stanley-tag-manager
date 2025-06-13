# Stanley Tag Manager - Version History

## Current Version: 1.0.0

### Version 1.0.0 - Initial Release
**Date**: December 2024
**Status**: ✅ DEPLOYED

#### Features:
- ✅ Shopify segment synchronization
- ✅ Customer segmentation by RFM groups, email domains, and tags
- ✅ Comprehensive pagination system for large segments (5000+ customers)
- ✅ Bulk customer tagging functionality
- ✅ Persistent tagging rules with PostgreSQL database
- ✅ Individual segment customer syncing
- ✅ Real-time customer count loading
- ✅ Debug endpoints for troubleshooting

#### Technical Implementation:
- **Pagination System**: Fetches ALL customers from large segments using pagination
- **RFM Group Support**: Calculates RFM groups based on orders and spending
- **Multiple API Approaches**: GraphQL, REST API, and search API fallbacks
- **Rate Limiting**: 100ms delays between API requests
- **Error Handling**: Comprehensive error handling and logging
- **Database Persistence**: PostgreSQL for tagging rules and segments

#### Known Issues:
- Champions segment count may still show incorrect numbers
- Customer sync may not work for all segment types
- Some Shopify API limitations may affect large segments

#### Next Steps:
- Debug Champions segment count issue
- Improve customer sync reliability
- Add more segment criteria types

---

## Version Tracking Rules:
1. **Major Version (X.0.0)**: Major feature additions or breaking changes
2. **Minor Version (X.Y.0)**: New features or significant improvements
3. **Patch Version (X.Y.Z)**: Bug fixes and minor improvements

## Deployment Status:
- **Current**: 1.0.0 - Deployed to Railway
- **Last Commit**: `72bb1aa` - "Trigger redeploy with pagination fixes for Champions segment"
- **Next Version**: 1.1.0 (when Champions segment issue is resolved) 