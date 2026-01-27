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

  const year = req.query.year || new Date().getFullYear();
  const threshold = parseFloat(req.query.threshold) || 80;

  try {
    const budget = await db.get('SELECT * FROM budget_plan WHERE year = $1', [year]);

    if (!budget) {
      return res.json({ success: true, alerts: [], message: 'No budget plan found' });
    }

    const expenses = await db.get(
      `SELECT SUM(total_amount) as ytd_expenses FROM expenses WHERE to_char(date, 'YYYY') = $1`,
      [year.toString()]
    );

    const ytdExpenses = expenses.ytd_expenses || 0;
    const annualBudget = budget.target_offering || 0;
    const percentUsed = (ytdExpenses / annualBudget) * 100;

    const alerts = [];

    if (percentUsed >= threshold) {
      alerts.push({
        type: 'budget_threshold',
        severity: percentUsed >= 95 ? 'critical' : 'warning',
        message: `Budget ${percentUsed.toFixed(1)}% utilized`,
        details: {
          ytdExpenses,
          annualBudget,
          percentUsed: percentUsed.toFixed(2),
          remaining: annualBudget - ytdExpenses,
        },
      });
    }

    res.json({
      success: true,
      alerts,
      budget: {
        year,
        annualBudget,
        ytdExpenses,
        percentUsed: percentUsed.toFixed(2),
        remaining: annualBudget - ytdExpenses,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});
