const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Get budget plan for a specific year
router.get("/plan/:year", authenticateToken, (req, res) => {
  const { year } = req.params;

  const query = `
    SELECT bp.*, 
           bc.id as category_id, bc.category, bc.subcategory, 
           bc.percentage, bc.budget_amount, bc.description
    FROM budget_plan bp
    LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
    WHERE bp.year = ?
    ORDER BY bc.category, bc.subcategory
  `;

  req.db.all(query, [year], (err, rows) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Budget plan not found for this year" });
    }

    // Group the results
    const budgetPlan = {
      id: rows[0].id,
      year: rows[0].year,
      target_offering: rows[0].target_offering,
      pbcm_percentage: rows[0].pbcm_percentage,
      pastoral_team_percentage: rows[0].pastoral_team_percentage,
      operational_percentage: rows[0].operational_percentage,
      created_at: rows[0].created_at,
      created_by: rows[0].created_by,
      categories: []
    };

    // Group categories
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
          description: row.description
        });
      }
    });

    budgetPlan.categories = Object.keys(categoryMap).map(category => ({
      category,
      items: categoryMap[category]
    }));

    res.json(budgetPlan);
  });
});

// Create or update budget plan
router.post("/plan", authenticateToken, (req, res) => {
  const {
    year,
    target_offering,
    pbcm_percentage = 10.00,
    pastoral_team_percentage = 10.00,
    operational_percentage = 80.00,
    categories = []
  } = req.body;

  if (!year || !target_offering) {
    return res.status(400).json({ error: "Year and target offering are required" });
  }

  // Insert or update budget plan
  const planQuery = `
    INSERT OR REPLACE INTO budget_plan 
    (year, target_offering, pbcm_percentage, pastoral_team_percentage, operational_percentage, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  req.db.run(planQuery, [
    year, target_offering, pbcm_percentage, pastoral_team_percentage, operational_percentage, req.user.email
  ], function (err) {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }

    const budgetPlanId = this.lastID || this.changes;

    // Delete existing categories for this plan
    req.db.run("DELETE FROM budget_categories WHERE budget_plan_id = ?", [budgetPlanId], (err) => {
      if (err) {
        console.error("Error deleting old categories:", err.message);
      }

      // Insert new categories
      if (categories.length > 0) {
        const categoryQuery = `
          INSERT INTO budget_categories 
          (budget_plan_id, category, subcategory, percentage, budget_amount, description)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        categories.forEach(cat => {
          req.db.run(categoryQuery, [
            budgetPlanId, cat.category, cat.subcategory, 
            cat.percentage, cat.budget_amount, cat.description
          ]);
        });
      }

      res.json({ id: budgetPlanId, message: "Budget plan saved successfully" });
    });
  });
});

// Get budget vs actual comparison
router.get("/comparison/:year", authenticateToken, (req, res) => {
  const { year } = req.params;
  const { month } = req.query;

  let dateFilter = `strftime('%Y', e.date) = ?`;
  let params = [year];

  if (month) {
    dateFilter = `strftime('%Y-%m', e.date) = ?`;
    params = [`${year}-${month.padStart(2, '0')}`];
  }

  const query = `
    SELECT 
      bc.category,
      bc.subcategory,
      bc.budget_amount,
      COALESCE(SUM(e.total_amount), 0) as actual_amount,
      bc.budget_amount - COALESCE(SUM(e.total_amount), 0) as variance
    FROM budget_plan bp
    LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
    LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${dateFilter}
    WHERE bp.year = ?
    GROUP BY bc.category, bc.subcategory, bc.budget_amount
    ORDER BY bc.category, bc.subcategory
  `;

  params.push(year);

  req.db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get available budget for a category
router.get("/available/:year/:category", authenticateToken, (req, res) => {
  const { year, category } = req.params;
  const { subcategory } = req.query;

  let categoryFilter = "bc.category = ?";
  let params = [category, year];

  if (subcategory) {
    categoryFilter = "bc.category = ? AND bc.subcategory = ?";
    params = [category, subcategory, year];
  }

  const query = `
    SELECT 
      bc.budget_amount,
      COALESCE(SUM(e.total_amount), 0) as spent_amount,
      bc.budget_amount - COALESCE(SUM(e.total_amount), 0) as available_amount
    FROM budget_plan bp
    LEFT JOIN budget_categories bc ON bp.id = bc.budget_plan_id
    LEFT JOIN expenses e ON e.category = bc.category 
      AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
      AND strftime('%Y', e.date) = ?
    WHERE bp.year = ? AND ${categoryFilter}
    GROUP BY bc.budget_amount
  `;

  req.db.get(query, params, (err, row) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(row || { budget_amount: 0, spent_amount: 0, available_amount: 0 });
  });
});

module.exports = router;