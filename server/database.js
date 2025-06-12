import { Client } from 'pg';

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

let client = null;

// Initialize database connection
async function initializeDatabase() {
  try {
    client = new Client(dbConfig);
    await client.connect();
    console.log('🗄️  Connected to PostgreSQL database');
    
    // Create tables if they don't exist
    await createTables();
    console.log('✅ Database tables initialized');
    
    return client;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (error.message.includes('does not exist') || !process.env.DATABASE_URL) {
      console.warn('⚠️  No database configured - using fallback in-memory storage');
      console.warn('   To enable persistence, add DATABASE_URL to your Railway environment variables');
      return null;
    }
    throw error;
  }
}

// Create database tables
async function createTables() {
  const createTablesSQL = `
    -- Create tagging rules table
    CREATE TABLE IF NOT EXISTS tagging_rules (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      trigger_segment VARCHAR(255) NOT NULL,
      actions JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create sessions table  
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
    );

    -- Create cache table for segments
    CREATE TABLE IF NOT EXISTS segment_cache (
      cache_key VARCHAR(255) PRIMARY KEY,
      data JSONB NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '5 minutes'),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create app configuration table
    CREATE TABLE IF NOT EXISTS app_config (
      key VARCHAR(255) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_tagging_rules_active ON tagging_rules(is_active);
    CREATE INDEX IF NOT EXISTS idx_tagging_rules_trigger ON tagging_rules(trigger_segment);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON segment_cache(expires_at);
  `;

  await client.query(createTablesSQL);
}

// Tagging Rules CRUD operations
async function saveTaggingRule(rule) {
  if (!client) {
    console.warn('Database not available - rule not persisted');
    return rule;
  }

  try {
    const query = `
      INSERT INTO tagging_rules (id, name, is_active, trigger_segment, actions, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        trigger_segment = EXCLUDED.trigger_segment,
        actions = EXCLUDED.actions,
        updated_at = EXCLUDED.updated_at
      RETURNING *;
    `;

    const values = [
      rule.id,
      rule.name,
      rule.isActive,
      rule.triggerSegment,
      JSON.stringify(rule.actions),
      rule.createdAt || new Date().toISOString(),
      new Date().toISOString()
    ];

    const result = await client.query(query, values);
    console.log(`💾 Saved tagging rule: ${rule.name}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error saving tagging rule:', error);
    throw error;
  }
}

async function getTaggingRules() {
  if (!client) {
    return []; // Return empty array if no database
  }

  try {
    const query = 'SELECT * FROM tagging_rules ORDER BY created_at DESC';
    const result = await client.query(query);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      triggerSegment: row.trigger_segment,
      actions: row.actions,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('Error getting tagging rules:', error);
    return [];
  }
}

async function deleteTaggingRule(ruleId) {
  if (!client) {
    console.warn('Database not available - rule not deleted');
    return false;
  }

  try {
    const query = 'DELETE FROM tagging_rules WHERE id = $1';
    const result = await client.query(query, [ruleId]);
    console.log(`🗑️  Deleted tagging rule: ${ruleId}`);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting tagging rule:', error);
    return false;
  }
}

// Session management
async function saveSession(sessionId, username) {
  if (!client) {
    return { sessionId, username, createdAt: Date.now() }; // Fallback to memory
  }

  try {
    const query = `
      INSERT INTO user_sessions (session_id, username, created_at, expires_at)
      VALUES ($1, $2, NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT (session_id)
      DO UPDATE SET expires_at = NOW() + INTERVAL '24 hours'
      RETURNING *;
    `;

    const result = await client.query(query, [sessionId, username]);
    return result.rows[0];
  } catch (error) {
    console.error('Error saving session:', error);
    return { sessionId, username, createdAt: Date.now() };
  }
}

async function getSession(sessionId) {
  if (!client) {
    return null;
  }

  try {
    const query = `
      SELECT * FROM user_sessions 
      WHERE session_id = $1 AND expires_at > NOW()
    `;
    
    const result = await client.query(query, [sessionId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

async function deleteSession(sessionId) {
  if (!client) {
    return false;
  }

  try {
    const query = 'DELETE FROM user_sessions WHERE session_id = $1';
    const result = await client.query(query, [sessionId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

// Cache management
async function setCache(key, data, ttlMinutes = 5) {
  if (!client) {
    return false;
  }

  try {
    const query = `
      INSERT INTO segment_cache (cache_key, data, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '${ttlMinutes} minutes')
      ON CONFLICT (cache_key)
      DO UPDATE SET 
        data = EXCLUDED.data,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `;

    await client.query(query, [key, JSON.stringify(data)]);
    return true;
  } catch (error) {
    console.error('Error setting cache:', error);
    return false;
  }
}

async function getCache(key) {
  if (!client) {
    return null;
  }

  try {
    const query = `
      SELECT data FROM segment_cache 
      WHERE cache_key = $1 AND expires_at > NOW()
    `;
    
    const result = await client.query(query, [key]);
    return result.rows[0]?.data || null;
  } catch (error) {
    console.error('Error getting cache:', error);
    return null;
  }
}

// Clean up expired data
async function cleanupExpiredData() {
  if (!client) {
    return;
  }

  try {
    await client.query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    await client.query('DELETE FROM segment_cache WHERE expires_at < NOW()');
    console.log('🧹 Cleaned up expired sessions and cache');
  } catch (error) {
    console.error('Error cleaning up expired data:', error);
  }
}

// Health check
async function isDatabaseConnected() {
  if (!client) {
    return false;
  }

  try {
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

// Graceful shutdown
async function closeDatabase() {
  if (client) {
    await client.end();
    console.log('🗄️  Database connection closed');
  }
}

export {
  initializeDatabase,
  saveTaggingRule,
  getTaggingRules,
  deleteTaggingRule,
  saveSession,
  getSession,
  deleteSession,
  setCache,
  getCache,
  cleanupExpiredData,
  isDatabaseConnected,
  closeDatabase
}; 