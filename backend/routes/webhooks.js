const express = require("express");
const router = express.Router();

/**
 * Webhook Routes for n8n Integration
 *
 * These endpoints are called by n8n workflows for:
 * - Health checks
 * - Data validation
 * - Status updates
 */

// Webhook secret for security (set in environment)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-this-secret';

// Middleware to validate webhook requests
function validateWebhook(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;

  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({
      error: "Unauthorized webhook request",
      message: "Invalid webhook secret"
    });
  }

  next();
}

// Health check endpoint for n8n
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "SBCC Financial API - Webhooks"
  });
});

// Endpoint to trigger manual backup (called by n8n)
router.post("/trigger-backup", validateWebhook, (req, res) => {
  // This endpoint is just a signal to n8n
  // The actual backup is done by n8n workflow
  res.json({
    success: true,
    message: "Backup trigger received",
    timestamp: new Date().toISOString()
  });
});

// Get recent form submissions (for n8n monitoring)
router.get("/recent-submissions", validateWebhook, (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const limit = parseInt(req.query.limit) || 50;

  const sql = `
    SELECT
      'collection' as type,
      id,
      date,
      particular,
      total_amount,
      created_by,
      created_at,
      submitted_via
    FROM collections
    WHERE created_at > datetime('now', '-${hours} hours')

    UNION ALL

    SELECT
      'expense' as type,
      id,
      date,
      particular,
      total_amount,
      created_by,
      created_at,
      submitted_via
    FROM expenses
    WHERE created_at > datetime('now', '-${hours} hours')

    ORDER BY created_at DESC
    LIMIT ?
  `;

  req.db.all(sql, [limit], (err, rows) => {
    if (err) {
      console.error("Error fetching recent submissions:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      count: rows.length,
      submissions: rows
    });
  });
});

// Get financial summary (for n8n reports)
router.get("/financial-summary", validateWebhook, (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: "startDate and endDate are required"
    });
  }

  // Get collections
  req.db.get(
    `SELECT
      COUNT(*) as count,
      SUM(total_amount) as total,
      SUM(general_tithes_offering) as tithes,
      SUM(bank_interest) as interest
    FROM collections
    WHERE date BETWEEN ? AND ?`,
    [startDate, endDate],
    (err, collections) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      // Get expenses
      req.db.get(
        `SELECT
          COUNT(*) as count,
          SUM(total_amount) as total,
          SUM(pbcm_share_expense) as pbcm,
          SUM(pastoral_worker_support) as pastoral
        FROM expenses
        WHERE date BETWEEN ? AND ?`,
        [startDate, endDate],
        (expErr, expenses) => {
          if (expErr) {
            return res.status(500).json({ error: "Database error" });
          }

          const netBalance = (collections.total || 0) - (expenses.total || 0);

          res.json({
            success: true,
            period: {
              startDate,
              endDate
            },
            collections: {
              count: collections.count || 0,
              total: parseFloat(collections.total || 0),
              tithes: parseFloat(collections.tithes || 0),
              interest: parseFloat(collections.interest || 0)
            },
            expenses: {
              count: expenses.count || 0,
              total: parseFloat(expenses.total || 0),
              pbcm: parseFloat(expenses.pbcm || 0),
              pastoral: parseFloat(expenses.pastoral || 0)
            },
            summary: {
              netBalance: parseFloat(netBalance),
              collectionTotal: parseFloat(collections.total || 0),
              expenseTotal: parseFloat(expenses.total || 0)
            }
          });
        }
      );
    }
  );
});

// Webhook to receive form submission status from n8n
router.post("/form-status", validateWebhook, (req, res) => {
  const {
    formType,
    recordId,
    status,
    errorMessage,
    submitterEmail
  } = req.body;

  console.log(`[n8n] Form ${formType} - Record ${recordId} - Status: ${status}`);

  if (status === 'failed' && errorMessage) {
    console.error(`[n8n] Error: ${errorMessage} - User: ${submitterEmail}`);
  }

  // Could store this in a logs table for monitoring
  res.json({
    success: true,
    message: "Status received",
    timestamp: new Date().toISOString()
  });
});

// Get budget alerts (for n8n monitoring)
router.get("/budget-alerts", validateWebhook, (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const threshold = parseFloat(req.query.threshold) || 80; // 80% threshold

  // Get budget plan
  req.db.get(
    "SELECT * FROM budget_plan WHERE year = ?",
    [year],
    (err, budget) => {
      if (err || !budget) {
        return res.json({
          success: true,
          alerts: [],
          message: "No budget plan found"
        });
      }

      // Get YTD expenses
      req.db.get(
        `SELECT SUM(total_amount) as ytd_expenses
         FROM expenses
         WHERE strftime('%Y', date) = ?`,
        [year.toString()],
        (expErr, expenses) => {
          if (expErr) {
            return res.status(500).json({ error: "Database error" });
          }

          const ytdExpenses = expenses.ytd_expenses || 0;
          const annualBudget = budget.target_offering || 0;
          const percentUsed = (ytdExpenses / annualBudget) * 100;

          const alerts = [];

          if (percentUsed >= threshold) {
            alerts.push({
              type: "budget_threshold",
              severity: percentUsed >= 95 ? "critical" : "warning",
              message: `Budget ${percentUsed.toFixed(1)}% utilized`,
              details: {
                ytdExpenses,
                annualBudget,
                percentUsed: percentUsed.toFixed(2),
                remaining: annualBudget - ytdExpenses
              }
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
              remaining: annualBudget - ytdExpenses
            }
          });
        }
      );
    }
  );
});

// Endpoint to validate n8n webhook configuration
router.post("/test-connection", validateWebhook, (req, res) => {
  res.json({
    success: true,
    message: "n8n webhook connection successful!",
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

// Get all collections for Google Sheets sync
router.get("/collections-for-sheets", validateWebhook, (req, res) => {
  const { startDate, endDate, limit } = req.query;

  let sql = `
    SELECT
      id,
      date,
      control_number,
      particular as description,
      general_tithes_offering,
      sunday_school,
      youth,
      sisterhood_san_juan,
      sisterhood_labuin,
      brotherhood,
      bank_interest,
      total_amount,
      created_by,
      created_at,
      updated_at
    FROM collections
  `;

  const params = [];

  if (startDate && endDate) {
    sql += " WHERE date BETWEEN ? AND ?";
    params.push(startDate, endDate);
  }

  sql += " ORDER BY date DESC, created_at DESC";

  if (limit) {
    sql += " LIMIT ?";
    params.push(parseInt(limit));
  }

  req.db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error fetching collections:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      count: rows.length,
      collections: rows
    });
  });
});

// Get all expenses for Google Sheets sync
router.get("/expenses-for-sheets", validateWebhook, (req, res) => {
  const { startDate, endDate, limit } = req.query;

  let sql = `
    SELECT
      id,
      date,
      particular as description,
      category,
      pbcm_share_expense,
      pastoral_worker_support,
      cap_assistance,
      honorarium,
      conference_seminar,
      fellowship_events,
      anniversary_christmas,
      supplies,
      utilities,
      vehicle_maintenance,
      lto_registration,
      transportation_gas,
      building_maintenance,
      abccop_national,
      cbcc_share,
      kabalikat_share,
      abccop_community,
      total_amount,
      created_by,
      created_at,
      updated_at
    FROM expenses
  `;

  const params = [];

  if (startDate && endDate) {
    sql += " WHERE date BETWEEN ? AND ?";
    params.push(startDate, endDate);
  }

  sql += " ORDER BY date DESC, created_at DESC";

  if (limit) {
    sql += " LIMIT ?";
    params.push(parseInt(limit));
  }

  req.db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Error fetching expenses:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      count: rows.length,
      expenses: rows
    });
  });
});

module.exports = router;
