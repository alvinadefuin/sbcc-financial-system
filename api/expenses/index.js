const db = require('../_lib/database');
const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method === 'GET') {
    return authenticateToken(async (req, res) => {
      const { month, year, dateFrom, dateTo } = req.query;
      let query = 'SELECT * FROM expenses';
      let params = [];
      let whereConditions = [];
      let paramIndex = 1;

      if (dateFrom && dateTo) {
        whereConditions.push(`date BETWEEN $${paramIndex++} AND $${paramIndex++}`);
        params.push(dateFrom, dateTo);
      } else if (month && year) {
        whereConditions.push(`to_char(date, 'YYYY-MM') = $${paramIndex++}`);
        params.push(`${year}-${month.padStart(2, '0')}`);
      }

      if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
      }

      query += ' ORDER BY date DESC';

      try {
        const rows = await db.all(query, params);
        res.json(rows);
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'POST') {
    return authenticateToken(async (req, res) => {
      const {
        date, particular, forms_number, cheque_number, category, subcategory,
        total_amount, budget_amount, percentage_allocation, fund_source,
        pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
        conference_seminar, fellowship_events, anniversary_christmas, supplies,
        utilities, vehicle_maintenance, lto_registration, transportation_gas,
        building_maintenance, abccop_national, cbcc_share, kabalikat_share, abccop_community,
      } = req.body;

      if (!date || !category) {
        return res.status(400).json({ error: 'Date and category are required' });
      }

      let calculatedTotal = total_amount;
      if (!total_amount || total_amount === 0) {
        calculatedTotal = (parseFloat(pbcm_share_expense) || 0) +
          (parseFloat(pastoral_worker_support) || 0) +
          (parseFloat(cap_assistance) || 0) +
          (parseFloat(honorarium) || 0) +
          (parseFloat(conference_seminar) || 0) +
          (parseFloat(fellowship_events) || 0) +
          (parseFloat(anniversary_christmas) || 0) +
          (parseFloat(supplies) || 0) +
          (parseFloat(utilities) || 0) +
          (parseFloat(vehicle_maintenance) || 0) +
          (parseFloat(lto_registration) || 0) +
          (parseFloat(transportation_gas) || 0) +
          (parseFloat(building_maintenance) || 0) +
          (parseFloat(abccop_national) || 0) +
          (parseFloat(cbcc_share) || 0) +
          (parseFloat(kabalikat_share) || 0) +
          (parseFloat(abccop_community) || 0);
      }

      if (calculatedTotal <= 0) {
        return res.status(400).json({ error: 'Either total_amount or individual expense amounts must be provided' });
      }

      try {
        const result = await db.run(
          `INSERT INTO expenses (
            date, particular, forms_number, cheque_number, category, subcategory,
            total_amount, budget_amount, percentage_allocation, fund_source,
            pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
            conference_seminar, fellowship_events, anniversary_christmas, supplies,
            utilities, vehicle_maintenance, lto_registration, transportation_gas,
            building_maintenance, abccop_national, cbcc_share, kabalikat_share, abccop_community,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
          [
            date, particular || 'Expense Entry', forms_number, cheque_number,
            category, subcategory, calculatedTotal, budget_amount || 0,
            percentage_allocation || 0, fund_source || 'operational',
            pbcm_share_expense || 0, pastoral_worker_support || 0,
            cap_assistance || 0, honorarium || 0,
            conference_seminar || 0, fellowship_events || 0,
            anniversary_christmas || 0, supplies || 0,
            utilities || 0, vehicle_maintenance || 0,
            lto_registration || 0, transportation_gas || 0,
            building_maintenance || 0, abccop_national || 0,
            cbcc_share || 0, kabalikat_share || 0,
            abccop_community || 0, req.user.email,
          ]
        );

        res.json({ id: result.lastID, message: 'Expense added successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  res.status(405).end();
});
