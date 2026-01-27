const db = require('../../_lib/database');
const { cors, authenticateToken } = require('../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

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
    // Use INSERT ... ON CONFLICT for PostgreSQL (equivalent to INSERT OR REPLACE)
    const result = await db.run(
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

    // Get the budget plan ID
    const plan = await db.get('SELECT id FROM budget_plan WHERE year = $1', [year]);
    const budgetPlanId = plan.id;

    // Delete existing categories
    await db.run('DELETE FROM budget_categories WHERE budget_plan_id = $1', [budgetPlanId]);

    // Insert new categories
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
}));
