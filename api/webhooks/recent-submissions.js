const db = require('../_lib/database');
const { cors } = require('../_lib/auth');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-this-secret';

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook request' });
  }

  const hours = parseInt(req.query.hours) || 24;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const rows = await db.all(
      `SELECT
        'collection' as type, id, date, particular, total_amount,
        created_by, created_at, submitted_via
      FROM collections
      WHERE created_at > NOW() - INTERVAL '${hours} hours'

      UNION ALL

      SELECT
        'expense' as type, id, date, particular, total_amount,
        created_by, created_at, submitted_via
      FROM expenses
      WHERE created_at > NOW() - INTERVAL '${hours} hours'

      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({ success: true, count: rows.length, submissions: rows });
  } catch (err) {
    console.error('Error fetching recent submissions:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
