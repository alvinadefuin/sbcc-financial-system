const db = require('../_lib/database');
const { cors } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const limit = parseInt(req.query.limit) || 10;

  try {
    const collections = await db.all(
      "SELECT 'collection' as type, date, particular, total_amount, created_by, submitted_via FROM collections WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT $1",
      [limit]
    );

    const expenses = await db.all(
      "SELECT 'expense' as type, date, particular, total_amount, created_by, submitted_via FROM expenses WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT $1",
      [limit]
    );

    const allSubmissions = [...collections, ...expenses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    res.json({
      success: true,
      message: `Recent ${allSubmissions.length} form submissions`,
      submissions: allSubmissions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});
