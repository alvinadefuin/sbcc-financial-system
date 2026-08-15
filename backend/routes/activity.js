const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function boundedInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.entity_type) { conditions.push('entity_type = ?'); params.push(query.entity_type); }
  if (query.entity_id) { conditions.push('entity_id = ?'); params.push(parseInt(query.entity_id, 10)); }
  if (query.actor_email) { conditions.push('actor_email = ?'); params.push(query.actor_email); }
  if (query.from) { conditions.push('occurred_at >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('occurred_at < (?::date + 1)'); params.push(query.to); }

  return { where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params };
}

// GET /api/activity — super administrators only.
router.get("/", authenticateToken, checkRole(['super_admin']), (req, res) => {
  const limit = boundedInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedInt(req.query.offset, 0);
  const { where, params } = buildFilters(req.query);

  req.db.get(`SELECT COUNT(*) AS count FROM activity_log${where}`, params, (countErr, countRow) => {
    if (countErr) {
      console.error("Database error:", countErr.message);
      return res.status(500).json({ error: countErr.message });
    }

    req.db.all(
      `SELECT id, occurred_at, actor_email, actor_role, action, entity_type, entity_id, summary, changes
       FROM activity_log${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) {
          console.error("Database error:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({
          entries: rows || [],
          total: parseInt(countRow?.count ?? '0', 10),
          limit,
          offset,
        });
      }
    );
  });
});

module.exports = router;
