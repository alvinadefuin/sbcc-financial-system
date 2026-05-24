const express = require('express');
const db = require('./_lib/database');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-this-secret';

function checkWebhookSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook request' });
  }
  next();
}

// GET /api/webhooks/health
app.get('/api/webhooks/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SBCC Financial API - Webhooks',
  });
});

// GET /api/webhooks/budget-alerts
app.get('/api/webhooks/budget-alerts', checkWebhookSecret, async (req, res) => {
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

// GET /api/webhooks/financial-summary
app.get('/api/webhooks/financial-summary', checkWebhookSecret, async (req, res) => {
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

// POST /api/webhooks/form-status
app.post('/api/webhooks/form-status', checkWebhookSecret, (req, res) => {
  const { formType, recordId, status, errorMessage, submitterEmail } = req.body;

  console.log(`[n8n] Form ${formType} - Record ${recordId} - Status: ${status}`);

  if (status === 'failed' && errorMessage) {
    console.error(`[n8n] Error: ${errorMessage} - User: ${submitterEmail}`);
  }

  res.json({
    success: true,
    message: 'Status received',
    timestamp: new Date().toISOString(),
  });
});

// GET /api/webhooks/recent-submissions
app.get('/api/webhooks/recent-submissions', checkWebhookSecret, async (req, res) => {
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

// POST /api/webhooks/test-connection
app.post('/api/webhooks/test-connection', checkWebhookSecret, (req, res) => {
  res.json({
    success: true,
    message: 'n8n webhook connection successful!',
    timestamp: new Date().toISOString(),
    receivedData: req.body,
  });
});

// POST /api/webhooks/trigger-backup
app.post('/api/webhooks/trigger-backup', checkWebhookSecret, (req, res) => {
  res.json({
    success: true,
    message: 'Backup trigger received',
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
