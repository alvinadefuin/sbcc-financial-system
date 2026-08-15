const { Pool } = require('pg');
const { notDeleted } = require('./softDelete');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: 'sbcc-financial-system-vercel',
    });

    pool.on('error', (err) => {
      if (err.message !== 'Connection terminated unexpectedly') {
        console.error('PostgreSQL pool error:', err.message);
      }
    });
  }
  return pool;
}

// Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
function convertPlaceholders(query) {
  let pgQuery = query;
  let paramIndex = 1;
  while (pgQuery.includes('?')) {
    pgQuery = pgQuery.replace('?', '$' + paramIndex);
    paramIndex++;
  }
  return pgQuery;
}

/**
 * Builds the get/all/run trio over any query function, so a transaction's
 * checked-out client behaves identically to the shared pool.
 */
function makeRunner(query) {
  return {
    get: async (sql, params = []) => {
      const result = await query(convertPlaceholders(sql), params);
      return result.rows[0] || null;
    },
    all: async (sql, params = []) => {
      const result = await query(convertPlaceholders(sql), params);
      return result.rows;
    },
    run: async (sql, params = []) => {
      let pgQuery = convertPlaceholders(sql);

      // Handle INSERT queries to return lastID
      if (pgQuery.trim().toLowerCase().startsWith('insert') && !pgQuery.toLowerCase().includes('returning')) {
        pgQuery += ' RETURNING *';
        const result = await query(pgQuery, params);
        return { lastID: result.rows[0]?.id, changes: result.rowCount };
      }

      const result = await query(pgQuery, params);
      return { changes: result.rowCount };
    },
  };
}

const pooled = makeRunner((sql, params) => getPool().query(sql, params));

const get = pooled.get;
const all = pooled.all;
const run = pooled.run;

/**
 * Runs `fn` inside a single database transaction.
 *
 * The callback is handed a `tx` runner with the same get/all/run interface as
 * this module. Use it for EVERY statement inside the callback: the pool is
 * capped at one connection, so calling the module-level get/all/run in here
 * waits for a connection that cannot be freed until this transaction ends.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  const tx = makeRunner((sql, params) => client.query(sql, params));

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { get, all, run, getPool, notDeleted, withTransaction };
