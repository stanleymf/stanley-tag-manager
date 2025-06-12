# Scratchpad - Customer Tagger Project

## Current Status
Successfully implemented the initial UI-only prototype for the Shopify Customer Tagger application.

## What's Been Built
- **Complete dashboard interface** with Klaviyo-inspired design
- **Customer segments view** showing mock Shopify segments with counts and sync status
- **Tagging rules management** with full CRUD operations
- **Rule creation form** with dynamic actions (add/remove tags)
- **Clean navigation** with sidebar layout
- **Responsive design** using Tailwind CSS and shadcn/ui components

## Key Components
1. `Sidebar` - Navigation between Dashboard and Rules
2. `Dashboard` - Customer segments overview with stats cards and table
3. `Rules` - Rules management with create/edit/delete functionality
4. `RuleForm` - Modal form for creating and editing tagging rules
5. `mockData.ts` - Sample data for segments and rules

## Design Patterns Used
- Clean, minimal Klaviyo-inspired interface
- Blue accent color (#2563eb) for primary actions
- Gray color palette for text hierarchy
- Card-based layout for data presentation
- Table views for list data
- Modal forms for complex interactions

## Current Features Working
- View customer segments with counts and sync status
- Create new tagging rules with conditions and actions
- Edit existing rules
- Toggle rules active/inactive
- Delete rules
- Dynamic action management (add/remove multiple tag actions)
- Form validation and error handling

## Mock Data Structure
- 6 customer segments with realistic names and counts
- 3 sample tagging rules demonstrating different use cases
- Proper TypeScript interfaces for type safety

## Next Steps
Ready for user feedback and iterative improvements based on specific requirements or design preferences.