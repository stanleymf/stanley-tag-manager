#!/usr/bin/env node

// Simple test script to check Railway deployment
async function testAPI() {
  const baseURL = 'https://stanley-tag-manager-production.up.railway.app';
  
  console.log('🔍 Testing Stanley Tag Manager API...\n');
  
  try {
    // Test health endpoint
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${baseURL}/api/health`);
    const healthData = await healthResponse.json();
    console.log('Health Status:', healthData);
    console.log('✅ Health check passed\n');
    
    // Test Shopify debug endpoint
    console.log('2️⃣ Testing Shopify connection...');
    const debugResponse = await fetch(`${baseURL}/api/debug/shopify`);
    const debugData = await debugResponse.json();
    console.log('Shopify Debug:', debugData);
    
    if (debugData.success) {
      console.log('✅ Shopify connection successful\n');
    } else {
      console.log('❌ Shopify connection failed\n');
    }
    
    // Test segments endpoint
    console.log('3️⃣ Testing segments endpoint...');
    const segmentsResponse = await fetch(`${baseURL}/api/segments`);
    const segmentsData = await segmentsResponse.json();
    
    if (segmentsResponse.ok) {
      console.log('Segments:', segmentsData.segments?.map(s => `${s.name}: ${s.customerCount}`) || segmentsData);
      console.log('✅ Segments endpoint working\n');
    } else {
      console.log('❌ Segments endpoint failed:', segmentsData);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAPI(); 