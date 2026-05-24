const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./_lib/database');
const { JWT_SECRET } = require('./_lib/auth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// GET /api/expenses
app.get('/api/expenses', verifyToken, async (req, res) => {
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
});

// POST /api/expenses
app.post('/api/expenses', verifyToken, async (req, res) => {
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
});

// GET /api/expenses/:id
app.get('/api/expenses/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await db.get('SELECT * FROM expenses WHERE id = $1', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id
app.put('/api/expenses/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
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
});

// DELETE /api/expenses/:id
app.delete('/api/expenses/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
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
});

module.exports = app;
