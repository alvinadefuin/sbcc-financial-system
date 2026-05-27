/**
 * Tests for the Database class seeding logic in database.js.
 *
 * database.js has a top-level `return` statement (to short-circuit the PostgreSQL
 * branch) that Babel rejects when transforming the file through Jest. We therefore
 * cannot require() it directly inside Jest. Instead we delegate to
 * _database_test_helper.js — a plain Node.js script (no Babel) that exercises the
 * exact same schema + seedDefaultCustomFields() logic, runs seeding twice for the
 * idempotency check, and writes results to stdout as JSON.
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const HELPER_SCRIPT = path.join(__dirname, '_database_test_helper.js');
const TEMP_DB = path.join(os.tmpdir(), 'sbcc_test_' + process.pid + '.db');

afterAll(() => {
  if (fs.existsSync(TEMP_DB)) fs.unlinkSync(TEMP_DB);
});

// Run the helper once and cache results for all tests in this suite.
let rows;

function getRows() {
  if (!rows) {
    const output = execSync('node "' + HELPER_SCRIPT + '"', {
      env: Object.assign({}, process.env, { TEST_DB_PATH: TEMP_DB }),
      timeout: 15000,
    }).toString();
    rows = JSON.parse(output);
  }
  return rows;
}

describe('Database class — seedDefaultCustomFields()', () => {
  it('should seed exactly 9 rows with table_name = "collections"', () => {
    const collectionRows = getRows().filter(function(r) { return r.table_name === 'collections'; });
    expect(collectionRows.length).toBe(9);
  });

  it('general_tithes_offering row should have correct label, type, is_active, and display_order', () => {
    const row = getRows().find(function(r) {
      return r.table_name === 'collections' && r.field_name === 'general_tithes_offering';
    });
    expect(row).toBeDefined();
    expect(row.field_label).toBe('General Tithes & Offering');
    expect(row.field_type).toBe('decimal');
    expect(row.is_active).toBe(1);
    expect(row.display_order).toBe(0);
  });

  it('should seed exactly 17 rows with table_name = "expenses"', () => {
    const expenseRows = getRows().filter(function(r) { return r.table_name === 'expenses'; });
    expect(expenseRows.length).toBe(17);
  });

  it('abccop_community row should have correct label and display_order', () => {
    const row = getRows().find(function(r) {
      return r.table_name === 'expenses' && r.field_name === 'abccop_community';
    });
    expect(row).toBeDefined();
    expect(row.field_label).toBe('ABCCOP Community');
    expect(row.display_order).toBe(16);
  });

  it('calling seedDefaultCustomFields() again should not increase the row count (idempotency)', () => {
    // The helper runs seeding twice — total must still be 26 (9 collections + 17 expenses)
    expect(getRows().length).toBe(26);
  });
});
