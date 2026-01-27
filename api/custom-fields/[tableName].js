const db = require('../_lib/database');
const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  const { tableName } = req.query;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  try {
    const fields = await db.all(
      `SELECT * FROM custom_fields
      WHERE table_name = $1 AND is_active = true
      ORDER BY display_order ASC, created_at ASC`,
      [tableName]
    );
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));
