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

  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    const collections = await db.get(
      `SELECT COUNT(*) as count, SUM(total_amount) as total,
        SUM(general_tithes_offering) as tithes, SUM(bank_interest) as interest
      FROM collections WHERE date BETWEEN $1 AND $2`,
      [startDate, endDate]
    );

    const expenses = await db.get(
      `SELECT COUNT(*) as count, SUM(total_amount) as total,
        SUM(pbcm_share_expense) as pbcm, SUM(pastoral_worker_support) as pastoral
      FROM expenses WHERE date BETWEEN $1 AND $2`,
      [startDate, endDate]
    );

    const netBalance = (collections.total || 0) - (expenses.total || 0);

    res.json({
      success: true,
      period: { startDate, endDate },
      collections: {
        count: collections.count || 0,
        total: parseFloat(collections.total || 0),
        tithes: parseFloat(collections.tithes || 0),
        interest: parseFloat(collections.interest || 0),
      },
      expenses: {
        count: expenses.count || 0,
        total: parseFloat(expenses.total || 0),
        pbcm: parseFloat(expenses.pbcm || 0),
        pastoral: parseFloat(expenses.pastoral || 0),
      },
      summary: {
        netBalance: parseFloat(netBalance),
        collectionTotal: parseFloat(collections.total || 0),
        expenseTotal: parseFloat(expenses.total || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});
