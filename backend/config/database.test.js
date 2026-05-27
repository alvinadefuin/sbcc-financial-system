const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

describe('Database custom_fields seeding', () => {
  let testDb;
  const TEST_DB_PATH = path.join(__dirname, '..', '..', 'database', 'test_church_financial.db');

  beforeAll((done) => {
    // Ensure test database directory exists
    const dbDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Remove test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create a fresh test database
    testDb = new sqlite3.Database(TEST_DB_PATH, (err) => {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  afterAll((done) => {
    testDb.close((err) => {
      if (err) {
        done(err);
      } else {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
        done();
      }
    });
  });

  it('should seed default collection fields into custom_fields table', (done) => {
    // Create the custom_fields table
    const createTableSql = `
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
    `;

    testDb.run(createTableSql, (err) => {
      if (err) {
        done(err);
        return;
      }

      // Seed default collection fields
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

      const stmt = testDb.prepare(`
        INSERT OR IGNORE INTO custom_fields
          (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
        VALUES ('collections', ?, ?, 'decimal', 0, ?, 1, 'system')
      `);

      defaultCollectionFields.forEach(([name, label, order]) => stmt.run(name, label, order));

      stmt.finalize((err) => {
        if (err) {
          done(err);
          return;
        }

        // Verify the fields were inserted
        testDb.all(
          `SELECT COUNT(*) as count FROM custom_fields WHERE table_name = 'collections'`,
          [],
          (err, rows) => {
            if (err) {
              done(err);
              return;
            }

            expect(rows[0].count).toBe(9);

            // Verify specific fields exist
            testDb.all(
              `SELECT field_name, field_label, display_order FROM custom_fields WHERE table_name = 'collections' ORDER BY display_order`,
              [],
              (err, rows) => {
                if (err) {
                  done(err);
                  return;
                }

                expect(rows[0].field_name).toBe('general_tithes_offering');
                expect(rows[0].field_label).toBe('General Tithes & Offering');
                expect(rows[0].display_order).toBe(0);

                expect(rows[8].field_name).toBe('special_purpose_pledge');
                expect(rows[8].display_order).toBe(8);

                done();
              }
            );
          }
        );
      });
    });
  });

  it('should seed default expense fields into custom_fields table', (done) => {
    // Create the custom_fields table
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS custom_fields_exp (
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
    `;

    testDb.run(createTableSql, (err) => {
      if (err) {
        done(err);
        return;
      }

      // Seed default expense fields
      const defaultExpenseFields = [
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

      const stmt = testDb.prepare(`
        INSERT OR IGNORE INTO custom_fields_exp
          (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
        VALUES ('expenses', ?, ?, 'decimal', 0, ?, 1, 'system')
      `);

      defaultExpenseFields.forEach(([name, label, order]) => stmt.run(name, label, order));

      stmt.finalize((err) => {
        if (err) {
          done(err);
          return;
        }

        // Verify the fields were inserted
        testDb.all(
          `SELECT COUNT(*) as count FROM custom_fields_exp WHERE table_name = 'expenses'`,
          [],
          (err, rows) => {
            if (err) {
              done(err);
              return;
            }

            expect(rows[0].count).toBe(17);

            // Verify specific fields exist
            testDb.all(
              `SELECT field_name, field_label, display_order FROM custom_fields_exp WHERE table_name = 'expenses' ORDER BY display_order`,
              [],
              (err, rows) => {
                if (err) {
                  done(err);
                  return;
                }

                expect(rows[0].field_name).toBe('pbcm_share_expense');
                expect(rows[0].field_label).toBe('PBCM Share');
                expect(rows[0].display_order).toBe(0);

                expect(rows[16].field_name).toBe('abccop_community');
                expect(rows[16].display_order).toBe(16);

                done();
              }
            );
          }
        );
      });
    });
  });
});
