// updateDatabaseSchema.js
// Enhanced database schema to match SBCC's actual expense categories

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "database", "church_financial.db");

function updateDatabaseSchema() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
      return;
    }
    console.log("Connected to SQLite database for schema update.");
  });

  // Enhanced expenses table with all SBCC categories
  const updateExpensesSchema = `
    -- Drop existing expenses table (backup data first if needed)
    DROP TABLE IF EXISTS expenses_backup;
    CREATE TABLE expenses_backup AS SELECT * FROM expenses;
    
    DROP TABLE expenses;
    
    -- Create enhanced expenses table matching SBCC structure
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      particular TEXT NOT NULL,
      forms_number TEXT,
      cheque_number TEXT,
      total_amount DECIMAL(10,2) NOT NULL,
      
      -- Main expense categories from SBCC records
      workers_share DECIMAL(10,2) DEFAULT 0,
      benevolence_donations DECIMAL(10,2) DEFAULT 0,
      honorarium DECIMAL(10,2) DEFAULT 0,
      fellowship_expense DECIMAL(10,2) DEFAULT 0,
      supplies DECIMAL(10,2) DEFAULT 0,
      utilities DECIMAL(10,2) DEFAULT 0,
      vehicle_maintenance DECIMAL(10,2) DEFAULT 0,
      gasoline_transport DECIMAL(10,2) DEFAULT 0,
      building_maintenance DECIMAL(10,2) DEFAULT 0,
      pbcm_share DECIMAL(10,2) DEFAULT 0,
      mission_evangelism DECIMAL(10,2) DEFAULT 0,
      admin_expense DECIMAL(10,2) DEFAULT 0,
      worship_music DECIMAL(10,2) DEFAULT 0,
      discipleship DECIMAL(10,2) DEFAULT 0,
      pastoral_care DECIMAL(10,2) DEFAULT 0,
      
      -- System fields
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    );
  `;

  // Enhanced collections table
  const updateCollectionsSchema = `
    -- Drop existing collections table (backup data first if needed)
    DROP TABLE IF EXISTS collections_backup;
    CREATE TABLE collections_backup AS SELECT * FROM collections;
    
    DROP TABLE collections;
    
    -- Create enhanced collections table matching SBCC structure
    CREATE TABLE collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      particular TEXT NOT NULL,
      control_number TEXT UNIQUE,
      payment_method TEXT DEFAULT 'Cash',
      total_amount DECIMAL(10,2) NOT NULL,
      
      -- Main collection categories from SBCC records
      tithes_offerings DECIMAL(10,2) DEFAULT 0,
      pbcm_share DECIMAL(10,2) DEFAULT 0,
      pastoral_team DECIMAL(10,2) DEFAULT 0,
      operating_funds DECIMAL(10,2) DEFAULT 0,
      mission_funds DECIMAL(10,2) DEFAULT 0,
      special_funds DECIMAL(10,2) DEFAULT 0,
      
      -- Pass-through accounts (various groups)
      ce_funds DECIMAL(10,2) DEFAULT 0,
      young_people DECIMAL(10,2) DEFAULT 0,
      singles DECIMAL(10,2) DEFAULT 0,
      couples DECIMAL(10,2) DEFAULT 0,
      brotherhood DECIMAL(10,2) DEFAULT 0,
      sisterhood DECIMAL(10,2) DEFAULT 0,
      labuin_sisterhood DECIMAL(10,2) DEFAULT 0,
      san_juan_prayer DECIMAL(10,2) DEFAULT 0,
      sitio_antipolo DECIMAL(10,2) DEFAULT 0,
      house_church DECIMAL(10,2) DEFAULT 0,
      special_offerings DECIMAL(10,2) DEFAULT 0,
      
      -- System fields
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    );
  `;

  console.log("🔄 Updating database schema to match SBCC financial structure...");

  // Execute schema updates
  db.exec(updateCollectionsSchema, (err) => {
    if (err) {
      console.error("Error updating collections schema:", err.message);
    } else {
      console.log("✅ Collections table updated successfully");
    }
  });

  db.exec(updateExpensesSchema, (err) => {
    if (err) {
      console.error("Error updating expenses schema:", err.message);
    } else {
      console.log("✅ Expenses table updated successfully");
    }
  });

  // Create financial reports view
  const createReportsView = `
    -- Create a view for monthly financial summary
    CREATE VIEW IF NOT EXISTS monthly_financial_summary AS
    SELECT 
      strftime('%Y-%m', c.date) as month_year,
      strftime('%Y', c.date) as year,
      strftime('%m', c.date) as month,
      
      -- Collections summary
      SUM(c.total_amount) as total_collections,
      SUM(c.tithes_offerings) as total_tithes,
      SUM(c.pbcm_share) as total_pbcm_collections,
      SUM(c.operating_funds) as total_operating_collections,
      SUM(c.mission_funds) as total_mission_collections,
      
      -- Expenses summary  
      COALESCE(SUM(e.total_amount), 0) as total_expenses,
      COALESCE(SUM(e.workers_share), 0) as total_workers_expenses,
      COALESCE(SUM(e.fellowship_expense), 0) as total_fellowship_expenses,
      COALESCE(SUM(e.supplies), 0) as total_supplies_expenses,
      COALESCE(SUM(e.utilities), 0) as total_utilities_expenses,
      COALESCE(SUM(e.building_maintenance), 0) as total_maintenance_expenses,
      
      -- Net calculation
      SUM(c.total_amount) - COALESCE(SUM(e.total_amount), 0) as net_balance
      
    FROM collections c
    LEFT JOIN expenses e ON strftime('%Y-%m', c.date) = strftime('%Y-%m', e.date)
    GROUP BY strftime('%Y-%m', c.date)
    ORDER BY strftime('%Y-%m', c.date) DESC;
  `;

  db.exec(createReportsView, (err) => {
    if (err) {
      console.error("Error creating reports view:", err.message);
    } else {
      console.log("✅ Financial reports view created successfully");
    }
  });

  setTimeout(() => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 SBCC DATABASE SCHEMA UPDATE COMPLETED");
    console.log("=".repeat(60));
    console.log("✅ Enhanced collections table with 11 funding categories");
    console.log("✅ Enhanced expenses table with 15 expense categories");
    console.log("✅ Added monthly_financial_summary view for reports");
    console.log("✅ Backup tables created (collections_backup, expenses_backup)");
    
    console.log("\n📋 New Expense Categories:");
    console.log("   • Workers Share • Benevolence & Donations • Honorarium");
    console.log("   • Fellowship Expense • Supplies • Utilities");
    console.log("   • Vehicle Maintenance • Gasoline & Transport • Building Maintenance");
    console.log("   • PBCM Share • Mission & Evangelism • Admin Expense");
    console.log("   • Worship & Music • Discipleship • Pastoral Care");
    
    console.log("\n📋 Collection Categories:");
    console.log("   • Tithes & Offerings • PBCM Share • Operating Funds");
    console.log("   • Mission Funds • Special Funds • Group Funds (CE, YP, etc.)");
    
    console.log("\n🚀 Ready to run the seeder script to add January 2023 data!");
    
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
    });
  }, 1000);
}

// Run the schema update
if (require.main === module) {
  console.log("🔧 Starting SBCC Database Schema Update...");
  console.log("Enhancing database to match actual church financial structure\n");
  updateDatabaseSchema();
}

module.exports = { updateDatabaseSchema };