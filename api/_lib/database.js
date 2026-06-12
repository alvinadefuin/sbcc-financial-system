const { Pool } = require('pg');

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

async function get(query, params = []) {
  const pgQuery = convertPlaceholders(query);
  const result = await getPool().query(pgQuery, params);
  return result.rows[0] || null;
}

async function all(query, params = []) {
  const pgQuery = convertPlaceholders(query);
  const result = await getPool().query(pgQuery, params);
  return result.rows;
}

async function run(query, params = []) {
  let pgQuery = convertPlaceholders(query);

  // Handle INSERT queries to return lastID
  if (pgQuery.trim().toLowerCase().startsWith('insert') && !pgQuery.toLowerCase().includes('returning')) {
    pgQuery += ' RETURNING *';
    const result = await getPool().query(pgQuery, params);
    return {
      lastID: result.rows[0]?.id,
      changes: result.rowCount,
    };
  }

  const result = await getPool().query(pgQuery, params);
  return {
    changes: result.rowCount,
  };
}

module.exports = { get, all, run, getPool };
