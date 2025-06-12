const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(
  __dirname,
  "..",
  "..",
  "database",
  "church_financial.db"
);

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
        role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        particular TEXT NOT NULL,
        control_number TEXT UNIQUE,
        payment_method TEXT DEFAULT 'Cash',
        total_amount DECIMAL(10,2) NOT NULL,
        tithes_offerings DECIMAL(10,2) DEFAULT 0,
        pbcm_share DECIMAL(10,2) DEFAULT 0,
        operating_funds DECIMAL(10,2) DEFAULT 0,
        mission_funds DECIMAL(10,2) DEFAULT 0,
        special_funds DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        particular TEXT NOT NULL,
        forms_number TEXT,
        cheque_number TEXT,
        total_amount DECIMAL(10,2) NOT NULL,
        workers_share DECIMAL(10,2) DEFAULT 0,
        fellowship_expense DECIMAL(10,2) DEFAULT 0,
        supplies DECIMAL(10,2) DEFAULT 0,
        utilities DECIMAL(10,2) DEFAULT 0,
        building_maintenance DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
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
      INSERT OR IGNORE INTO users (email, name, role, password_hash)
      VALUES ('admin@sbcc.church', 'Church Administrator', 'admin', ?)
    `,
      [defaultPassword],
      (err) => {
        if (err) {
          console.log("Admin user already exists or error:", err.message);
        } else {
          console.log(
            "Default admin user created: admin@sbcc.church / admin123"
          );
        }
      }
    );
  }

  getDatabase() {
    return this.db;
  }
}

module.exports = new Database();
