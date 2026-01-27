const db = require('../../../_lib/database');
const { cors, authenticateToken } = require('../../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { year, category, subcategory } = req.query;

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
}));
