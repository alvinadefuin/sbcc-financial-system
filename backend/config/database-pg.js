const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

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

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(date);
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
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
    } catch (error) {
      console.error('Error seeding database:', error);
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
          .catch(err => callback(err));
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