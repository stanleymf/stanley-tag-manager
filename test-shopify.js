import dotenv from 'dotenv';

dotenv.config();

async function testShopifyAPI() {
  console.log('=== TESTING SHOPIFY REST API ===');
  console.log('Store URL:', process.env.SHOPIFY_STORE_URL);
  console.log('Access Token configured:', !!process.env.SHOPIFY_ACCESS_TOKEN);
  
  try {
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10/customers.json?limit=5`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        }
      }
    );
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    console.log(`Customer count: ${data.customers?.length || 0}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testShopifyAPI(); 