'use strict';
/**
 * Standalone Node.js helper for database.test.js.
 *
 * Accepts TEST_DB_PATH env var, creates a fresh SQLite DB using the exact same
 * schema and seedDefaultCustomFields() logic as database.js, runs seeding twice
 * (for idempotency check), then writes all custom_fields rows as JSON to stdout.
 *
 * All informational logs go to stderr so stdout contains only parseable JSON.
 */
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_PATH = process.env.TEST_DB_PATH;
if (!DB_PATH) {
  process.stderr.write('TEST_DB_PATH not set\n');
  process.exit(1);
}

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    submitted_via TEXT DEFAULT 'web'
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    submitted_via TEXT DEFAULT 'web'
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
  CREATE TABLE IF NOT EXISTS custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL CHECK(table_name IN ('collections', 'expenses')),
    field_name TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK(field_type IN ('decimal', 'text', 'date', 'integer', 'boolean')),
    default_value TEXT,
    is_required BOOLEAN DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    category TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(table_name, field_name)
  );
  CREATE TABLE IF NOT EXISTS custom_field_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_field_id INTEGER NOT NULL,
    record_id INTEGER NOT NULL,
    table_name TEXT NOT NULL CHECK(table_name IN ('collections', 'expenses')),
    field_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE CASCADE,
    UNIQUE(custom_field_id, record_id, table_name)
  );
`;

/**
 * Mirrors seedDefaultCustomFields() from database.js exactly.
 * Calls done() when both (collections + expenses) paths have completed.
 */
function seedDefaultCustomFields(db, done) {
  let pending = 2;
  function finish() {
    if (--pending === 0) done();
  }

  db.get(
    "SELECT COUNT(*) as count FROM custom_fields WHERE table_name = 'collections'",
    function(err, row) {
      if (err) {
        process.stderr.write('Error checking custom_fields seeding: ' + err.message + '\n');
        finish();
        return;
      }
      if (row && row.count > 0) { finish(); return; }

      const defaultCollectionFields = [
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

      var stmt = db.prepare(
        "INSERT OR IGNORE INTO custom_fields (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by) VALUES ('collections', ?, ?, 'decimal', 0, ?, 1, 'system')"
      );
      defaultCollectionFields.forEach(function(item) {
        stmt.run(item[0], item[1], item[2], function(err) {
          if (err) process.stderr.write('Error seeding collection field ' + item[0] + ': ' + err.message + '\n');
        });
      });
      stmt.finalize(function() {
        process.stderr.write('Default collection custom fields seeded\n');
        finish();
      });
    }
  );

  db.get(
    "SELECT COUNT(*) as count FROM custom_fields WHERE table_name = 'expenses'",
    function(err, row) {
      if (err) {
        process.stderr.write('Error checking custom_fields seeding: ' + err.message + '\n');
        finish();
        return;
      }
      if (row && row.count > 0) { finish(); return; }

      var defaultExpenseFields = [
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

      var stmt = db.prepare(
        "INSERT OR IGNORE INTO custom_fields (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by) VALUES ('expenses', ?, ?, 'decimal', 0, ?, 1, 'system')"
      );
      defaultExpenseFields.forEach(function(item) {
        stmt.run(item[0], item[1], item[2], function(err) {
          if (err) process.stderr.write('Error seeding expense field ' + item[0] + ': ' + err.message + '\n');
        });
      });
      stmt.finalize(function() {
        process.stderr.write('Default expense custom fields seeded\n');
        finish();
      });
    }
  );
}

var db = new sqlite3.Database(DB_PATH, function(err) {
  if (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }

  db.exec(createTables, function(err) {
    if (err) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }

    // First seed
    seedDefaultCustomFields(db, function() {
      // Second seed — idempotency check
      seedDefaultCustomFields(db, function() {
        db.all(
          'SELECT table_name, field_name, field_label, field_type, is_active, display_order FROM custom_fields ORDER BY table_name, display_order',
          function(err, rows) {
            if (err) {
              process.stderr.write(err.message + '\n');
              process.exit(1);
            }
            process.stdout.write(JSON.stringify(rows));
            db.close(function() {});
          }
        );
      });
    });
  });
});
