const express = require('express');
const db = require('./_lib/database');
const { verifyToken, checkRole } = require('./_lib/expressAuth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Whole numbers only, within bounds, falling back to `fallback`. */
function boundedInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

/**
 * Builds the shared WHERE clause. Only the four documented filters are read
 * from the query string; anything else is ignored, and every value is a bound
 * parameter.
 */
function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.entity_type) {
    conditions.push(`entity_type = $${params.length + 1}`);
    params.push(query.entity_type);
  }
  if (query.entity_id) {
    conditions.push(`entity_id = $${params.length + 1}`);
    params.push(parseInt(query.entity_id, 10));
  }
  if (query.actor_email) {
    conditions.push(`actor_email = $${params.length + 1}`);
    params.push(query.actor_email);
  }
  if (query.from) {
    conditions.push(`occurred_at >= $${params.length + 1}`);
    params.push(query.from);
  }
  if (query.to) {
    // Exclusive upper bound so a plain YYYY-MM-DD includes that whole day.
    conditions.push(`occurred_at < ($${params.length + 1}::date + 1)`);
    params.push(query.to);
  }

  return {
    where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// GET /api/activity — super administrators only.
app.get('/api/activity', verifyToken, checkRole(['super_admin']), async (req, res) => {
  const limit = boundedInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedInt(req.query.offset, 0);
  const { where, params } = buildFilters(req.query);

  try {
    const countRow = await db.get(`SELECT COUNT(*) AS count FROM activity_log${where}`, params);

    const entries = await db.all(
      `SELECT id, occurred_at, actor_email, actor_role, action, entity_type, entity_id, summary, changes
       FROM activity_log${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      entries,
      total: parseInt(countRow?.count ?? '0', 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
