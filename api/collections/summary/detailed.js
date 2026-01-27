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
        SUM(total_amount) as total_collections,
        SUM(general_tithes_offering) as total_general_tithes,
        SUM(bank_interest) as total_bank_interest,
        SUM(sisterhood_san_juan) as total_sisterhood_sj,
        SUM(sisterhood_labuin) as total_sisterhood_labuin,
        SUM(brotherhood) as total_brotherhood,
        SUM(youth) as total_youth,
        SUM(couples) as total_couples,
        SUM(sunday_school) as total_sunday_school,
        SUM(special_purpose_pledge) as total_special_purpose,
        SUM(pbcm_share) as total_pbcm_share,
        SUM(pastoral_team_share) as total_pastoral_share,
        SUM(operational_fund_share) as total_operational_share,
        COUNT(*) as total_records
      FROM collections${whereClause}`,
      params
    );
    res.json(row);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
}));
