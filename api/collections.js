const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./_lib/database');
const { JWT_SECRET } = require('./_lib/auth');
const { enrichRecordsWithCustomFields, getCustomFieldValues, saveCustomFieldValues } = require('./_lib/customFieldsHelper');

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

// GET /api/collections
app.get('/api/collections', verifyToken, async (req, res) => {
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
});

// POST /api/collections
app.post('/api/collections', verifyToken, async (req, res) => {
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

  // Duplicate detection
  if (!req.body.force) {
    const dup = await db.get(
      'SELECT id, created_by, date FROM collections WHERE date = $1 AND total_amount = $2',
      [date, calculatedTotal]
    );
    if (dup) {
      return res.status(409).json({
        error: 'Duplicate entry detected',
        conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
      });
    }
  }

  const generalTithesAmount = parseFloat(general_tithes_offering) || 0;
  const pbcmShare = generalTithesAmount * 0.10;
  const pastoralTeamShare = generalTithesAmount * 0.10;
  const operationalFundShare = generalTithesAmount * 0.80;

  // Treat empty string as absent — auto-generate a control number
  let finalControlNumber = control_number || null;
  if (!finalControlNumber) {
    const year = new Date().getFullYear();
    const maxRow = await db.get(
      `SELECT control_number FROM collections WHERE control_number LIKE $1 ORDER BY control_number DESC LIMIT 1`,
      [`${year}-%`]
    );
    const maxNum = maxRow ? (parseInt(maxRow.control_number.match(/\d+$/)?.[0]) || 0) : 0;
    finalControlNumber = `${year}-${String(maxNum + 1).padStart(3, '0')}`;
  }

  try {
    let collectionId;
    let ctrlNum = finalControlNumber;

    for (let attempt = 0; attempt <= 5; attempt++) {
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
            date, particular || 'Collection Entry', ctrlNum, payment_method || 'Cash',
            calculatedTotal, general_tithes_offering || 0, bank_interest || 0,
            sisterhood_san_juan || 0, sisterhood_labuin || 0, brotherhood || 0,
            youth || 0, couples || 0, sunday_school || 0, special_purpose_pledge || 0,
            pbcmShare, pastoralTeamShare, operationalFundShare, req.user.email,
          ]
        );
        collectionId = result.lastID;
        break;
      } catch (insertErr) {
        const isCtrlConflict = insertErr.code === '23505' &&
          (insertErr.constraint?.includes('control_number') || insertErr.detail?.includes('control_number'));
        if (isCtrlConflict && attempt < 5) {
          const parts = ctrlNum.split('-');
          const nextSeq = String((parseInt(parts[parts.length - 1]) || 0) + 1).padStart(3, '0');
          ctrlNum = `${parts.slice(0, -1).join('-')}-${nextSeq}`;
          continue;
        }
        throw insertErr;
      }
    }

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
});

// GET /api/collections/summary/detailed
app.get('/api/collections/summary/detailed', verifyToken, async (req, res) => {
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
});

// GET /api/collections/fund-allocation/summary
app.get('/api/collections/fund-allocation/summary', verifyToken, async (req, res) => {
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
});

// GET /api/collections/:id
app.get('/api/collections/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
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
});

// PUT /api/collections/:id
app.put('/api/collections/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
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
});

// DELETE /api/collections/:id
app.delete('/api/collections/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
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
});

module.exports = app;
