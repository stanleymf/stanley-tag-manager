# Shopify Customer Segment Criteria - Complete Reference

## Overview
Shopify customer segments can be created using various criteria combinations. Understanding these is crucial for proper customer syncing.

## Primary Criteria Types

### 1. Customer Properties
- **customer_email_domain** - Email domain matching
- **customer_tags** - Customer tags
- **customer_first_name** - First name
- **customer_last_name** - Last name
- **customer_phone** - Phone number
- **customer_created_at** - Account creation date
- **customer_updated_at** - Last update date

### 2. Order-Based Criteria
- **orders_count** - Total number of orders
- **total_spent** - Total amount spent
- **average_order_value** - Average order value
- **last_order_date** - Date of most recent order
- **first_order_date** - Date of first order

### 3. RFM (Recency, Frequency, Monetary) Groups
- **rfm_group** - Shopify's internal RFM segmentation
  - `CHAMPIONS` - High frequency, high monetary value
  - `LOYAL_CUSTOMERS` - Regular customers
  - `AT_RISK` - Declining customers
  - `CANT_LOSE` - One-time customers
  - `NEED_ATTENTION` - Recent but low value
  - `ABOUT_TO_SLEEP` - Inactive customers
  - `LOST_CUSTOMERS` - Long inactive

### 4. Geographic Criteria
- **customer_country** - Country
- **customer_province** - State/Province
- **customer_city** - City
- **customer_zip** - Postal code

### 5. Product-Based Criteria
- **purchased_product** - Has purchased specific product
- **purchased_product_type** - Has purchased product type
- **purchased_product_vendor** - Has purchased from vendor
- **purchased_product_tag** - Has purchased product with tag

### 6. Collection-Based Criteria
- **purchased_collection** - Has purchased from collection

### 7. Discount-Based Criteria
- **used_discount_code** - Has used specific discount
- **used_discount_type** - Has used discount type

### 8. Marketing Criteria
- **accepted_marketing** - Has accepted marketing emails
- **marketing_opt_in_level** - Marketing opt-in level

### 9. Customer State
- **customer_state** - Customer state (enabled/disabled)
- **customer_verified_email** - Email verification status

## Complex Criteria Combinations
Shopify segments can use multiple criteria with AND/OR logic:
- `customer_email_domain = 'example.com' AND orders_count > 5`
- `rfm_group = 'CHAMPIONS' OR total_spent > 1000`
- `customer_tags = 'VIP' AND orders_count >= 3`

## API Access Methods

### 1. GraphQL API
```graphql
query getSegmentCustomers($segmentId: ID!, $first: Int!) {
  customerSegment(id: $segmentId) {
    id
    name
    customers(first: $first) {
      edges {
        node {
          id
          email
          firstName
          lastName
          ordersCount
          totalSpent
          tags
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

### 2. REST API
- `/admin/api/2023-10/customer_segments/{id}/customers.json`
- `/admin/api/2023-10/customers/search.json?query=...`

### 3. Customer Search API
- Supports complex queries: `rfm_group:CHAMPIONS`
- Email domain: `email:*@example.com`
- Tags: `tag:VIP`
- Orders: `orders_count:>5`

## Current Implementation Status

### ✅ Working Criteria:
- `customer_email_domain` - Basic email domain filtering
- `customer_tags` - Tag-based filtering
- `rfm_group` - RFM group calculation (basic)

### ❌ Issues:
- **Champions segment**: Shows 0 count, syncs only 50 customers
- **RFM API access**: May not be using correct Shopify RFM endpoints
- **Pagination**: May not be handling all customer data properly

## Next Steps for Champions Segment Fix

1. **Verify RFM Group Access**: Check if Shopify provides direct RFM group data
2. **Test Different APIs**: Try all possible API methods for RFM groups
3. **Implement Proper RFM Calculation**: Use Shopify's actual RFM logic
4. **Fix Pagination**: Ensure all 5664 customers are fetched
5. **Add Comprehensive Logging**: Track exactly what's happening

## Testing Strategy

1. **Direct API Tests**: Test each API endpoint individually
2. **Criteria Parsing**: Verify our criteria parsing logic
3. **Customer Data Validation**: Check what customer data we're actually getting
4. **RFM Calculation**: Compare our RFM logic with Shopify's
5. **Pagination Verification**: Ensure we're getting all customers 