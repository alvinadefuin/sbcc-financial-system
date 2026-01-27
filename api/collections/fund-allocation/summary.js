const db = require('../../_lib/database');
const { cors, authenticateToken } = require('../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { month, year } = req.query;
  let whereClause = '';
  let params = [];

  if (month && year) {
    whereClause = " WHERE to_char(date, 'YYYY-MM') = $1";
    params.push(`${year}-${month.padStart(2, '0')}`);
  }

  try {
    const row = await db.get(
      `SELECT
        SUM(general_tithes_amount) as total_tithes,
        SUM(pbcm_allocation) as total_pbcm,
        SUM(pastoral_team_allocation) as total_pastoral,
        SUM(operational_allocation) as total_operational
      FROM fund_allocation${whereClause}`,
      params
    );
    res.json(row);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
}));
