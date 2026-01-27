const db = require('../_lib/database');
const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    return authenticateToken(async (req, res) => {
      try {
        const row = await db.get('SELECT * FROM expenses WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'PUT') {
    return authenticateToken(async (req, res) => {
      const {
        date, particular, forms_number, cheque_number, total_amount,
        workers_share, fellowship_expense, supplies, utilities, building_maintenance,
        benevolence_donations, honorarium, vehicle_maintenance, gasoline_transport,
        pbcm_share, mission_evangelism, admin_expense, worship_music, discipleship, pastoral_care,
      } = req.body;

      if (!date) {
        return res.status(400).json({ error: 'Date is required' });
      }

      let calculatedTotal = total_amount;
      if (!total_amount || total_amount === 0) {
        calculatedTotal = (parseFloat(workers_share) || 0) +
          (parseFloat(fellowship_expense) || 0) +
          (parseFloat(supplies) || 0) +
          (parseFloat(utilities) || 0) +
          (parseFloat(building_maintenance) || 0) +
          (parseFloat(benevolence_donations) || 0) +
          (parseFloat(honorarium) || 0) +
          (parseFloat(vehicle_maintenance) || 0) +
          (parseFloat(gasoline_transport) || 0) +
          (parseFloat(pbcm_share) || 0) +
          (parseFloat(mission_evangelism) || 0) +
          (parseFloat(admin_expense) || 0) +
          (parseFloat(worship_music) || 0) +
          (parseFloat(discipleship) || 0) +
          (parseFloat(pastoral_care) || 0);
      }

      if (calculatedTotal <= 0) {
        return res.status(400).json({ error: 'Either total_amount or individual expense amounts must be provided' });
      }

      try {
        const result = await db.run(
          `UPDATE expenses SET
            date = $1, particular = $2, forms_number = $3, cheque_number = $4, total_amount = $5,
            workers_share = $6, fellowship_expense = $7, supplies = $8, utilities = $9, building_maintenance = $10,
            benevolence_donations = $11, honorarium = $12, vehicle_maintenance = $13, gasoline_transport = $14,
            pbcm_share = $15, mission_evangelism = $16, admin_expense = $17, worship_music = $18, discipleship = $19, pastoral_care = $20
          WHERE id = $21`,
          [
            date, particular || 'Expense Entry', forms_number, cheque_number, calculatedTotal,
            workers_share || 0, fellowship_expense || 0, supplies || 0, utilities || 0,
            building_maintenance || 0, benevolence_donations || 0, honorarium || 0,
            vehicle_maintenance || 0, gasoline_transport || 0, pbcm_share || 0,
            mission_evangelism || 0, admin_expense || 0, worship_music || 0,
            discipleship || 0, pastoral_care || 0, id,
          ]
        );

        if (result.changes === 0) {
          return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense updated successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return authenticateToken(async (req, res) => {
      try {
        const result = await db.run('DELETE FROM expenses WHERE id = $1', [id]);
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense deleted successfully' });
      } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ error: err.message });
      }
    })(req, res);
  }

  res.status(405).end();
});
