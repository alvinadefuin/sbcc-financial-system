const db = require('../_lib/database');
const { cors, authenticateToken } = require('../_lib/auth');
const { enrichRecordsWithCustomFields, saveCustomFieldValues } = require('../_lib/customFieldsHelper');

module.exports = cors(async (req, res) => {
  if (req.method === 'GET') {
    return authenticateToken(async (req, res) => {
      const { month, year, dateFrom, dateTo } = req.query;
      let query = 'SELECT * FROM collections';
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
        try {
          const enriched = await enrichRecordsWithCustomFields('collections', rows);
          res.json(enriched);
        } catch (customFieldErr) {
          console.error('Error fetching custom fields:', customFieldErr);
          res.json(rows);
        }
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'POST') {
    return authenticateToken(async (req, res) => {
      const {
        date, particular, control_number, payment_method, total_amount,
        general_tithes_offering, bank_interest,
        sisterhood_san_juan, sisterhood_labuin, brotherhood, youth, couples,
        sunday_school, special_purpose_pledge, custom_fields,
      } = req.body;

      if (!date) {
        return res.status(400).json({ error: 'Date is required' });
      }

      let calculatedTotal = total_amount;
      if (!total_amount || total_amount === 0) {
        calculatedTotal = (parseFloat(general_tithes_offering) || 0) +
          (parseFloat(bank_interest) || 0) +
          (parseFloat(sisterhood_san_juan) || 0) +
          (parseFloat(sisterhood_labuin) || 0) +
          (parseFloat(brotherhood) || 0) +
          (parseFloat(youth) || 0) +
          (parseFloat(couples) || 0) +
          (parseFloat(sunday_school) || 0) +
          (parseFloat(special_purpose_pledge) || 0);
      }

      if (calculatedTotal <= 0) {
        return res.status(400).json({ error: 'Either total_amount or individual collection amounts must be provided' });
      }

      const generalTithesAmount = parseFloat(general_tithes_offering) || 0;
      const pbcmShare = generalTithesAmount * 0.10;
      const pastoralTeamShare = generalTithesAmount * 0.10;
      const operationalFundShare = generalTithesAmount * 0.80;

      try {
        const result = await db.run(
          `INSERT INTO collections (
            date, particular, control_number, payment_method, total_amount,
            general_tithes_offering, bank_interest,
            sisterhood_san_juan, sisterhood_labuin, brotherhood, youth, couples, sunday_school, special_purpose_pledge,
            pbcm_share, pastoral_team_share, operational_fund_share,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            date, particular || 'Collection Entry', control_number, payment_method || 'Cash',
            calculatedTotal, general_tithes_offering || 0, bank_interest || 0,
            sisterhood_san_juan || 0, sisterhood_labuin || 0, brotherhood || 0,
            youth || 0, couples || 0, sunday_school || 0, special_purpose_pledge || 0,
            pbcmShare, pastoralTeamShare, operationalFundShare, req.user.email,
          ]
        );

        const collectionId = result.lastID;

        // Create fund allocation record
        await db.run(
          `INSERT INTO fund_allocation (
            collection_id, date, general_tithes_amount,
            pbcm_allocation, pastoral_team_allocation, operational_allocation
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [collectionId, date, generalTithesAmount, pbcmShare, pastoralTeamShare, operationalFundShare]
        );

        if (custom_fields) {
          try {
            await saveCustomFieldValues('collections', collectionId, custom_fields);
          } catch (customFieldErr) {
            console.error('Error saving custom fields:', customFieldErr);
            return res.json({
              id: collectionId,
              message: 'Collection added successfully, but custom fields may not have been saved',
              customFieldError: customFieldErr.message,
            });
          }
        }

        res.json({ id: collectionId, message: 'Collection added successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  res.status(405).end();
});
