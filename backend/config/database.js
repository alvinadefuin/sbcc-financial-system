const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// For Railway deployment, check for volume mount or fallback to writable directory
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? (process.env.DATABASE_PATH || '/app/data/church_financial.db') // Use env var or volume mount
  : path.join(__dirname, "..", "..", "database", "church_financial.db");

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created database directory: ${dbDir}`);
}

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
      } else {
        console.log("Connected to SQLite database.");
        this.initializeTables();
      }
    });
  }

  initializeTables() {
    const createTables = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('super_admin', 'admin', 'user')) DEFAULT 'user',
        google_id TEXT UNIQUE,
        profile_picture TEXT,
        password_hash TEXT,
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        particular TEXT NOT NULL,
        control_number TEXT UNIQUE,
        payment_method TEXT DEFAULT 'Cash',
        total_amount DECIMAL(10,2) NOT NULL,
        -- Main collection categories
        general_tithes_offering DECIMAL(10,2) DEFAULT 0,
        bank_interest DECIMAL(10,2) DEFAULT 0,
        -- Pass-through accounts
        sisterhood_san_juan DECIMAL(10,2) DEFAULT 0,
        sisterhood_labuin DECIMAL(10,2) DEFAULT 0,
        brotherhood DECIMAL(10,2) DEFAULT 0,
        youth DECIMAL(10,2) DEFAULT 0,
        couples DECIMAL(10,2) DEFAULT 0,
        sunday_school DECIMAL(10,2) DEFAULT 0,
        special_purpose_pledge DECIMAL(10,2) DEFAULT 0,
        -- Fund allocation (auto-calculated)
        pbcm_share DECIMAL(10,2) DEFAULT 0, -- 10% of general tithes
        pastoral_team_share DECIMAL(10,2) DEFAULT 0, -- 10% of general tithes
        operational_fund_share DECIMAL(10,2) DEFAULT 0, -- 80% of general tithes
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        submitted_via TEXT DEFAULT 'web' -- 'web' or 'google_form'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        particular TEXT NOT NULL,
        forms_number TEXT,
        cheque_number TEXT,
        category TEXT NOT NULL, -- Main expense category
        subcategory TEXT, -- Specific expense type
        total_amount DECIMAL(10,2) NOT NULL,
        budget_amount DECIMAL(10,2) DEFAULT 0,
        percentage_allocation DECIMAL(5,2) DEFAULT 0,
        fund_source TEXT DEFAULT 'operational', -- operational, pastoral_team, pbcm_share
        -- Detailed expense categories
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        submitted_via TEXT DEFAULT 'web' -- 'web' or 'google_form'
      );

      CREATE TABLE IF NOT EXISTS budget_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        target_offering DECIMAL(10,2) NOT NULL,
        pbcm_percentage DECIMAL(5,2) DEFAULT 10.00,
        pastoral_team_percentage DECIMAL(5,2) DEFAULT 10.00,
        operational_percentage DECIMAL(5,2) DEFAULT 80.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        UNIQUE(year)
      );

      CREATE TABLE IF NOT EXISTS budget_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_plan_id INTEGER,
        category TEXT NOT NULL,
        subcategory TEXT,
        percentage DECIMAL(5,2) DEFAULT 0,
        budget_amount DECIMAL(10,2) DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (budget_plan_id) REFERENCES budget_plan(id)
      );

      CREATE TABLE IF NOT EXISTS fund_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER,
        date DATE NOT NULL,
        general_tithes_amount DECIMAL(10,2) DEFAULT 0,
        pbcm_allocation DECIMAL(10,2) DEFAULT 0,
        pastoral_team_allocation DECIMAL(10,2) DEFAULT 0,
        operational_allocation DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      );
    `;

    this.db.exec(createTables, (err) => {
      if (err) {
        console.error("Error creating tables:", err.message);
      } else {
        console.log("Database tables initialized.");
        this.seedDatabase();
      }
    });
  }

  seedDatabase() {
    // Insert default admin user
    const bcrypt = require("bcryptjs");
    const defaultPassword = bcrypt.hashSync("admin123", 10);

    this.db.run(
      `
      INSERT OR IGNORE INTO users (email, name, role, password_hash, created_by)
      VALUES ('admin@sbcc.church', 'Church Super Administrator', 'super_admin', ?, 'system')
    `,
      [defaultPassword],
      (err) => {
        if (err) {
          console.log("Super admin user already exists or error:", err.message);
        } else {
          console.log(
            "Default super admin user created: admin@sbcc.church / admin123"
          );
        }
      }
    );

    // Insert default budget plan for 2025
    this.db.run(
      `
      INSERT OR IGNORE INTO budget_plan (year, target_offering, created_by)
      VALUES (2025, 109916.67, 'admin@sbcc.church')
    `,
      [],
      (err) => {
        if (err) {
          console.log("Budget plan already exists or error:", err.message);
        } else {
          console.log("Default 2025 budget plan created");
          this.seedBudgetCategories();
        }
      }
    );
  }

  seedBudgetCategories() {
    const budgetCategories = [
      { category: 'PBCM Share/PDOT', subcategory: 'PBCM Share', percentage: 10.00, amount: 9500.00 },
      { category: 'Pastoral Team', subcategory: 'Pastoral Team', percentage: 10.00, amount: 9500.00 },
      { category: 'Operational Fund', subcategory: 'Pastoral & Worker Support', percentage: null, amount: 31291.67 },
      { category: 'Operational Fund', subcategory: 'CAP-Churches Assistance Program', percentage: null, amount: 1000.00 },
      { category: 'Operational Fund', subcategory: 'Honorarium', percentage: null, amount: 7000.00 },
      { category: 'Operational Fund', subcategory: 'Conference/Seminar/Retreat/Assembly', percentage: null, amount: 1000.00 },
      { category: 'Operational Fund', subcategory: 'Fellowship Events', percentage: null, amount: 1275.00 },
      { category: 'Operational Fund', subcategory: 'Anniversary/Christmas Events', percentage: null, amount: 14833.33 },
      { category: 'Operational Fund', subcategory: 'Supplies', percentage: null, amount: 3000.00 },
      { category: 'Operational Fund', subcategory: 'Utilities', percentage: null, amount: 15000.00 },
      { category: 'Operational Fund', subcategory: 'Vehicle Maintenance', percentage: null, amount: 5000.00 },
      { category: 'Operational Fund', subcategory: 'LTO Registration', percentage: null, amount: 416.67 },
      { category: 'Operational Fund', subcategory: 'Transportation & Gas', percentage: null, amount: 3500.00 },
      { category: 'Operational Fund', subcategory: 'Building Maintenance', percentage: null, amount: 3000.00 },
      { category: 'Operational Fund', subcategory: 'ABCCOP National', percentage: null, amount: 400.00 },
      { category: 'Operational Fund', subcategory: 'CBCC Share', percentage: null, amount: 600.00 },
      { category: 'Operational Fund', subcategory: 'Kabalikat Share', percentage: null, amount: 200.00 },
      { category: 'Operational Fund', subcategory: 'ABCCOP Community Day', percentage: null, amount: 416.67 }
    ];

    this.db.get("SELECT id FROM budget_plan WHERE year = 2025", (err, row) => {
      if (row) {
        const budgetPlanId = row.id;
        budgetCategories.forEach(category => {
          this.db.run(
            `INSERT OR IGNORE INTO budget_categories 
             (budget_plan_id, category, subcategory, percentage, budget_amount) 
             VALUES (?, ?, ?, ?, ?)`,
            [budgetPlanId, category.category, category.subcategory, category.percentage, category.amount]
          );
        });
        console.log("Budget categories seeded");
      }
    });
  }

  getDatabase() {
    return this.db;
  }
}

module.exports = new Database();
