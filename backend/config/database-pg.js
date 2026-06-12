const { Pool } = require('pg');

// PostgreSQL connection - get DATABASE_URL from environment (Railway sets this)
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set!');
  throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
}

// Neon DB optimized configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('sslmode=require'))
    ? { rejectUnauthorized: false }
    : false,
  max: 10, // Neon free tier supports up to 100 connections, 10 is safe for most apps
  min: 0, // Don't keep idle connections (Neon will auto-scale)
  idleTimeoutMillis: 20000, // Close idle connections after 20s (faster than Neon's timeout)
  connectionTimeoutMillis: 10000, // 10s timeout for new connections
  allowExitOnIdle: false, // Keep pool running even when all clients are idle
  // Neon-specific: Auto-reconnect on connection loss
  application_name: 'sbcc-financial-system',
});

// Test the connection immediately with error handling
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('Check your DATABASE_URL and Neon DB status');
  } else {
    console.log('✅ Neon PostgreSQL connected at:', res.rows[0].now);
    console.log('✅ Database ready for queries');
  }
});

// Handle pool errors gracefully
pool.on('error', (err, client) => {
  // Only log actual errors, not normal disconnections
  if (err.message !== 'Connection terminated unexpectedly') {
    console.error('❌ PostgreSQL pool error:', err.message);
  }
  // Pool will auto-reconnect on next query
});

// Only log connections in development
if (process.env.NODE_ENV !== 'production') {
  pool.on('connect', (client) => {
    console.log('🔗 New PostgreSQL client connected');
  });

  pool.on('remove', (client) => {
    console.log('🔓 PostgreSQL client disconnected');
  });
}

class PostgresDatabase {
  constructor() {
    this.pool = pool;
    this.initializeTables();
  }

  async initializeTables() {
    try {
      console.log('Initializing PostgreSQL tables...');
      
      // Test connection first
      await this.pool.query('SELECT NOW()');
      console.log('✅ PostgreSQL connection successful!');
      
      const createTables = `
        -- Create users table
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          role TEXT CHECK(role IN ('super_admin', 'admin', 'user')) DEFAULT 'user',
          google_id TEXT UNIQUE,
          profile_picture TEXT,
          password_hash TEXT,
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create collections table
        CREATE TABLE IF NOT EXISTS collections (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          particular TEXT NOT NULL,
          control_number TEXT UNIQUE,
          payment_method TEXT DEFAULT 'Cash',
          total_amount DECIMAL(10,2) NOT NULL,
          general_tithes_offering DECIMAL(10,2) DEFAULT 0,
          bank_interest DECIMAL(10,2) DEFAULT 0,
          sisterhood_san_juan DECIMAL(10,2) DEFAULT 0,
          sisterhood_labuin DECIMAL(10,2) DEFAULT 0,
          brotherhood DECIMAL(10,2) DEFAULT 0,
          youth DECIMAL(10,2) DEFAULT 0,
          couples DECIMAL(10,2) DEFAULT 0,
          sunday_school DECIMAL(10,2) DEFAULT 0,
          special_purpose_pledge DECIMAL(10,2) DEFAULT 0,
          pbcm_share DECIMAL(10,2) DEFAULT 0,
          pastoral_team_share DECIMAL(10,2) DEFAULT 0,
          operational_fund_share DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          submitted_via TEXT DEFAULT 'web'
        );

        -- Create expenses table
        CREATE TABLE IF NOT EXISTS expenses (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          particular TEXT NOT NULL,
          forms_number TEXT,
          cheque_number TEXT,
          category TEXT NOT NULL,
          subcategory TEXT,
          total_amount DECIMAL(10,2) NOT NULL,
          budget_amount DECIMAL(10,2) DEFAULT 0,
          percentage_allocation DECIMAL(5,2) DEFAULT 0,
          fund_source TEXT DEFAULT 'operational',
          pbcm_share_expense DECIMAL(10,2) DEFAULT 0,
          pastoral_worker_support DECIMAL(10,2) DEFAULT 0,
          cap_assistance DECIMAL(10,2) DEFAULT 0,
          honorarium DECIMAL(10,2) DEFAULT 0,
          conference_seminar DECIMAL(10,2) DEFAULT 0,
          fellowship_events DECIMAL(10,2) DEFAULT 0,
          anniversary_christmas DECIMAL(10,2) DEFAULT 0,
          supplies DECIMAL(10,2) DEFAULT 0,
          utilities DECIMAL(10,2) DEFAULT 0,
          vehicle_maintenance DECIMAL(10,2) DEFAULT 0,
          lto_registration DECIMAL(10,2) DEFAULT 0,
          transportation_gas DECIMAL(10,2) DEFAULT 0,
          building_maintenance DECIMAL(10,2) DEFAULT 0,
          abccop_national DECIMAL(10,2) DEFAULT 0,
          cbcc_share DECIMAL(10,2) DEFAULT 0,
          kabalikat_share DECIMAL(10,2) DEFAULT 0,
          abccop_community DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          submitted_via TEXT DEFAULT 'web'
        );

        -- Custom fields schema
        CREATE TABLE IF NOT EXISTS custom_fields (
          id SERIAL PRIMARY KEY,
          table_name TEXT NOT NULL CHECK(table_name IN ('collections', 'expenses')),
          field_name TEXT NOT NULL,
          field_label TEXT NOT NULL,
          field_type TEXT NOT NULL CHECK(field_type IN ('decimal', 'text', 'date', 'integer', 'boolean')),
          default_value TEXT,
          is_required BOOLEAN DEFAULT false,
          display_order INTEGER DEFAULT 0,
          category TEXT,
          description TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(table_name, field_name)
        );

        CREATE TABLE IF NOT EXISTS custom_field_values (
          id SERIAL PRIMARY KEY,
          custom_field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
          record_id INTEGER NOT NULL,
          table_name TEXT NOT NULL CHECK(table_name IN ('collections', 'expenses')),
          field_value TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(custom_field_id, record_id, table_name)
        );

        -- Budget planning tables
        CREATE TABLE IF NOT EXISTS budget_plan (
          id SERIAL PRIMARY KEY,
          year INTEGER NOT NULL,
          target_offering DECIMAL(10,2) NOT NULL,
          pbcm_percentage DECIMAL(5,2) DEFAULT 10.00,
          pastoral_team_percentage DECIMAL(5,2) DEFAULT 10.00,
          operational_percentage DECIMAL(5,2) DEFAULT 80.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          UNIQUE(year)
        );

        CREATE TABLE IF NOT EXISTS budget_categories (
          id SERIAL PRIMARY KEY,
          budget_plan_id INTEGER REFERENCES budget_plan(id),
          category TEXT NOT NULL,
          subcategory TEXT,
          percentage DECIMAL(5,2) DEFAULT 0,
          budget_amount DECIMAL(10,2) DEFAULT 0,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Application settings and reporting tables
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_by TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS report_syncs (
          id SERIAL PRIMARY KEY,
          year INTEGER NOT NULL,
          spreadsheet_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('success','failed')),
          error TEXT,
          synced_by TEXT,
          synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(date);
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_custom_fields_table ON custom_fields(table_name);
      `;

      await this.pool.query(createTables);
      console.log('PostgreSQL tables initialized successfully');
      
      // Seed default admin user
      await this.seedDatabase();
    } catch (error) {
      console.error('Error initializing PostgreSQL tables:', error);
    }
  }

  async seedDatabase() {
    try {
      const bcrypt = require('bcryptjs');
      const defaultPassword = bcrypt.hashSync('admin123', 10);

      await this.pool.query(
        `INSERT INTO users (email, name, role, password_hash, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        ['admin@sbcc.church', 'Church Super Administrator', 'super_admin', defaultPassword, 'system']
      );

      console.log('Default admin user ready: admin@sbcc.church / admin123');
      await this.seedDefaultCustomFields();
    } catch (error) {
      console.error('Error seeding database:', error);
    }
  }

  async seedDefaultCustomFields() {
    try {
      const collectionFields = [
        ['general_tithes_offering', 'General Tithes & Offering', 0],
        ['bank_interest', 'Bank Interest', 1],
        ['sisterhood_san_juan', 'Sisterhood (San Juan)', 2],
        ['sisterhood_labuin', 'Sisterhood (Labuin)', 3],
        ['brotherhood', 'Brotherhood', 4],
        ['youth', 'Youth', 5],
        ['couples', 'Couples', 6],
        ['sunday_school', 'Sunday School', 7],
        ['special_purpose_pledge', 'Special Purpose / Pledge', 8],
      ];

      for (const [name, label, order] of collectionFields) {
        await this.pool.query(
          `INSERT INTO custom_fields (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
           VALUES ('collections', $1, $2, 'decimal', false, $3, true, 'system')
           ON CONFLICT (table_name, field_name) DO NOTHING`,
          [name, label, order]
        );
      }

      const expenseFields = [
        ['pbcm_share_expense', 'PBCM Share', 0],
        ['pastoral_worker_support', 'Pastoral Worker Support', 1],
        ['cap_assistance', 'CAP Assistance', 2],
        ['honorarium', 'Honorarium', 3],
        ['conference_seminar', 'Conference / Seminar', 4],
        ['fellowship_events', 'Fellowship Events', 5],
        ['anniversary_christmas', 'Anniversary / Christmas', 6],
        ['supplies', 'Supplies', 7],
        ['utilities', 'Utilities', 8],
        ['vehicle_maintenance', 'Vehicle Maintenance', 9],
        ['lto_registration', 'LTO Registration', 10],
        ['transportation_gas', 'Transportation / Gas', 11],
        ['building_maintenance', 'Building Maintenance', 12],
        ['abccop_national', 'ABCCOP National', 13],
        ['cbcc_share', 'CBCC Share', 14],
        ['kabalikat_share', 'Kabalikat Share', 15],
        ['abccop_community', 'ABCCOP Community', 16],
      ];

      for (const [name, label, order] of expenseFields) {
        await this.pool.query(
          `INSERT INTO custom_fields (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
           VALUES ('expenses', $1, $2, 'decimal', false, $3, true, 'system')
           ON CONFLICT (table_name, field_name) DO NOTHING`,
          [name, label, order]
        );
      }

      console.log('Default custom fields seeded');
    } catch (error) {
      console.error('Error seeding custom fields:', error);
    }
  }

  // Wrapper methods to match SQLite interface
  async get(query, params) {
    try {
      // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
      let pgQuery = query;
      let paramIndex = 1;
      while (pgQuery.includes('?')) {
        pgQuery = pgQuery.replace('?', '$' + paramIndex);
        paramIndex++;
      }
      
      const result = await this.pool.query(pgQuery, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database get error:', error);
      throw error;
    }
  }

  async all(query, params) {
    try {
      // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
      let pgQuery = query;
      let paramIndex = 1;
      while (pgQuery.includes('?')) {
        pgQuery = pgQuery.replace('?', '$' + paramIndex);
        paramIndex++;
      }
      
      const result = await this.pool.query(pgQuery, params);
      return result.rows;
    } catch (error) {
      console.error('Database all error:', error);
      throw error;
    }
  }

  async run(query, params) {
    try {
      // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
      let pgQuery = query;
      let paramIndex = 1;
      while (pgQuery.includes('?')) {
        pgQuery = pgQuery.replace('?', '$' + paramIndex);
        paramIndex++;
      }
      
      // Handle INSERT queries to return lastID
      if (pgQuery.toLowerCase().includes('insert')) {
        pgQuery += ' RETURNING id';
        const result = await this.pool.query(pgQuery, params);
        return {
          lastID: result.rows[0]?.id,
          changes: result.rowCount
        };
      }
      
      const result = await this.pool.query(pgQuery, params);
      return {
        changes: result.rowCount
      };
    } catch (error) {
      console.error('Database run error:', error);
      throw error;
    }
  }

  getDatabase() {
    // Return wrapper object that mimics SQLite interface
    return {
      get: (query, params, callback) => {
        this.get(query, params)
          .then(row => callback(null, row))
          .catch(err => {
            console.error('PostgreSQL get error:', err.message);
            console.error('Query:', query);
            console.error('Params:', params);
            callback(err);
          });
      },
      all: (query, params, callback) => {
        this.all(query, params)
          .then(rows => callback(null, rows))
          .catch(err => callback(err));
      },
      run: (query, params, callback) => {
        // Handle both function callback and 'this' context callback
        const actualCallback = typeof params === 'function' ? params : callback;
        const actualParams = typeof params === 'function' ? [] : params;
        
        this.run(query, actualParams)
          .then(result => {
            if (actualCallback) {
              // Bind the result to 'this' context for compatibility
              actualCallback.call(result, null);
            }
          })
          .catch(err => {
            if (actualCallback) {
              actualCallback(err);
            }
          });
      }
    };
  }
}

module.exports = new PostgresDatabase();