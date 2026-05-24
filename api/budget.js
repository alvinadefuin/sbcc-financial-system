const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./_lib/database');
const { JWT_SECRET } = require('./_lib/auth');

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

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// POST /api/budget/plan
app.post('/api/budget/plan', verifyToken, async (req, res) => {
  const {
    year,
    target_offering,
    pbcm_percentage = 10.00,
    pastoral_team_percentage = 10.00,
    operational_percentage = 80.00,
    categories = [],
  } = req.body;

  if (!year || !target_offering) {
    return res.status(400).json({ error: 'Year and target offering are required' });
  }

  try {
    await db.run(
      `INSERT INTO budget_plan
      (year, target_offering, pbcm_percentage, pastoral_team_percentage, operational_percentage, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (year) DO UPDATE SET
        target_offering = EXCLUDED.target_offering,
        pbcm_percentage = EXCLUDED.pbcm_percentage,
        pastoral_team_percentage = EXCLUDED.pastoral_team_percentage,
        operational_percentage = EXCLUDED.operational_percentage,
        created_by = EXCLUDED.created_by`,
      [year, target_offering, pbcm_percentage, pastoral_team_percentage, operational_percentage, req.user.email]
    );

    const plan = await db.get('SELECT id FROM budget_plan WHERE year = $1', [year]);
    const budgetPlanId = plan.id;

    await db.run('DELETE FROM budget_categories WHERE budget_plan_id = $1', [budgetPlanId]);

    for (const cat of categories) {
      await db.run(
        `INSERT INTO budget_categories
        (budget_plan_id, category, subcategory, percentage, budget_amount, description)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [budgetPlanId, cat.category, cat.subcategory, cat.percentage, cat.budget_amount, cat.description]
      );
    }

    res.json({ id: budgetPlanId, message: 'Budget plan saved successfully' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget/plan/:year
app.get('/api/budget/plan/:year', verifyToken, async (req, res) => {
  const { year } = req.params;

  try {
    const rows = await db.all(
      `SELECT bp.*,
             bc.id as category_id, bc.category, bc.subcategory,
             bc.percentage, bc.budget_amount, bc.description
      FROM budget_plan bp
      LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
      WHERE bp.year = $1
      ORDER BY bc.category, bc.subcategory`,
      [year]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Budget plan not found for this year' });
    }

    const budgetPlan = {
      id: rows[0].id,
      year: rows[0].year,
      target_offering: rows[0].target_offering,
      pbcm_percentage: rows[0].pbcm_percentage,
      pastoral_team_percentage: rows[0].pastoral_team_percentage,
      operational_percentage: rows[0].operational_percentage,
      created_at: rows[0].created_at,
      created_by: rows[0].created_by,
      categories: [],
    };

    const categoryMap = {};
    rows.forEach(row => {
      if (row.category) {
        if (!categoryMap[row.category]) {
          categoryMap[row.category] = [];
        }
        categoryMap[row.category].push({
          id: row.category_id,
          subcategory: row.subcategory,
          percentage: row.percentage,
          budget_amount: row.budget_amount,
          description: row.description,
        });
      }
    });

    budgetPlan.categories = Object.keys(categoryMap).map(category => ({
      category,
      items: categoryMap[category],
    }));

    res.json(budgetPlan);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget/comparison/:year
app.get('/api/budget/comparison/:year', verifyToken, async (req, res) => {
  const { year } = req.params;
  const { month } = req.query;

  let dateFilter = `to_char(e.date, 'YYYY') = $1`;
  let params = [year];

  if (month) {
    dateFilter = `to_char(e.date, 'YYYY-MM') = $1`;
    params = [`${year}-${month.padStart(2, '0')}`];
  }

  params.push(year);

  try {
    const rows = await db.all(
      `SELECT
        bc.category,
        bc.subcategory,
        bc.budget_amount,
        COALESCE(SUM(e.total_amount), 0) as actual_amount,
        bc.budget_amount - COALESCE(SUM(e.total_amount), 0) as variance
      FROM budget_plan bp
      LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
      LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${dateFilter}
      WHERE bp.year = $${params.length}
      GROUP BY bc.category, bc.subcategory, bc.budget_amount
      ORDER BY bc.category, bc.subcategory`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget/available/:year/:category
app.get('/api/budget/available/:year/:category', verifyToken, async (req, res) => {
  const { year, category } = req.params;
  const { subcategory } = req.query;

  let categoryFilter = 'bc.category = $1';
  let params = [category, year];

  if (subcategory) {
    categoryFilter = 'bc.category = $1 AND bc.subcategory = $2';
    params = [category, subcategory, year];
  }

  try {
    const row = await db.get(
      `SELECT
        bc.budget_amount,
        COALESCE(SUM(e.total_amount), 0) as spent_amount,
        bc.budget_amount - COALESCE(SUM(e.total_amount), 0) as available_amount
      FROM budget_plan bp
      LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
      LEFT JOIN expenses e ON e.category = bc.category
        AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
        AND to_char(e.date, 'YYYY') = $${params.length}
      WHERE bp.year = $${params.length} AND ${categoryFilter}
      GROUP BY bc.budget_amount`,
      params
    );

    res.json(row || { budget_amount: 0, spent_amount: 0, available_amount: 0 });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
