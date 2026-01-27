const db = require('../_lib/database');
const { cors, authenticateToken } = require('../_lib/auth');
const { getCustomFieldValues, saveCustomFieldValues } = require('../_lib/customFieldsHelper');

module.exports = cors(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    return authenticateToken(async (req, res) => {
      try {
        const row = await db.get('SELECT * FROM collections WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ error: 'Collection not found' });
        }
        try {
          const customFields = await getCustomFieldValues('collections', id);
          res.json({ ...row, custom_fields: customFields });
        } catch (customFieldErr) {
          res.json(row);
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'PUT') {
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
          `UPDATE collections SET
            date = $1, particular = $2, control_number = $3, payment_method = $4, total_amount = $5,
            general_tithes_offering = $6, bank_interest = $7,
            sisterhood_san_juan = $8, sisterhood_labuin = $9, brotherhood = $10, youth = $11, couples = $12,
            sunday_school = $13, special_purpose_pledge = $14,
            pbcm_share = $15, pastoral_team_share = $16, operational_fund_share = $17
          WHERE id = $18`,
          [
            date, particular || 'Collection Entry', control_number, payment_method || 'Cash',
            calculatedTotal, general_tithes_offering || 0, bank_interest || 0,
            sisterhood_san_juan || 0, sisterhood_labuin || 0, brotherhood || 0,
            youth || 0, couples || 0, sunday_school || 0, special_purpose_pledge || 0,
            pbcmShare, pastoralTeamShare, operationalFundShare, id,
          ]
        );

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Collection not found' });
        }

        // Update fund allocation
        await db.run(
          `UPDATE fund_allocation SET
            date = $1, general_tithes_amount = $2,
            pbcm_allocation = $3, pastoral_team_allocation = $4, operational_allocation = $5
          WHERE collection_id = $6`,
          [date, generalTithesAmount, pbcmShare, pastoralTeamShare, operationalFundShare, id]
        );

        if (custom_fields) {
          try {
            await saveCustomFieldValues('collections', id, custom_fields);
          } catch (customFieldErr) {
            console.error('Error saving custom fields:', customFieldErr);
            return res.json({
              message: 'Collection updated successfully, but custom fields may not have been saved',
              customFieldError: customFieldErr.message,
            });
          }
        }

        res.json({ message: 'Collection updated successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return authenticateToken(async (req, res) => {
      try {
        await db.run('DELETE FROM fund_allocation WHERE collection_id = $1', [id]);
        const result = await db.run('DELETE FROM collections WHERE id = $1', [id]);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Collection not found' });
        }
        res.json({ message: 'Collection deleted successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  res.status(405).end();
});
