const db = require('../../_lib/database');
const { cors, authenticateToken } = require('../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { year } = req.query;

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
}));
