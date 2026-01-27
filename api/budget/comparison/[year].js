const db = require('../../_lib/database');
const { cors, authenticateToken } = require('../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { year, month } = req.query;

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
}));
