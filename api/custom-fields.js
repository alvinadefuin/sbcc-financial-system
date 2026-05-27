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

function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// POST /api/custom-fields
app.post('/api/custom-fields', verifyToken, checkRole(['super_admin', 'admin']), async (req, res) => {
  const {
    table_name, field_name, field_label, field_type,
    default_value, is_required, display_order, category, description,
  } = req.body;

  if (!table_name || !field_name || !field_label || !field_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['collections', 'expenses'].includes(table_name)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const validTypes = ['decimal', 'text', 'date', 'integer', 'boolean'];
  if (!validTypes.includes(field_type)) {
    return res.status(400).json({ error: 'Invalid field type' });
  }

  if (!/^[a-z][a-z0-9_]*$/.test(field_name)) {
    return res.status(400).json({
      error: 'Field name must start with a letter and contain only lowercase letters, numbers, and underscores',
    });
  }

  try {
    const result = await db.run(
      `INSERT INTO custom_fields (
        table_name, field_name, field_label, field_type,
        default_value, is_required, display_order, category,
        description, created_by, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
      [
        table_name, field_name, field_label, field_type,
        default_value || null, is_required ? true : false,
        display_order || 0, category || null,
        description || null, req.user.email,
      ]
    );

    res.status(201).json({ id: result.lastID, message: 'Custom field created successfully' });
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'Field name already exists for this table' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/custom-fields/:tableName
app.get('/api/custom-fields/:tableName', verifyToken, async (req, res) => {
  const { tableName } = req.params;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const includeInactive = req.query.include_inactive === 'true';

  try {
    const fields = await db.all(
      `SELECT * FROM custom_fields
      WHERE table_name = $1${includeInactive ? '' : ' AND is_active = true'}
      ORDER BY display_order ASC, created_at ASC`,
      [tableName]
    );
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/custom-fields/manage/:id
app.put('/api/custom-fields/manage/:id', verifyToken, checkRole(['super_admin', 'admin']), async (req, res) => {
  const { id } = req.params;
  const {
    field_label, default_value, is_required,
    display_order, category, description, is_active,
  } = req.body;

  try {
    const result = await db.run(
      `UPDATE custom_fields SET
        field_label = COALESCE($1, field_label),
        default_value = COALESCE($2, default_value),
        is_required = COALESCE($3, is_required),
        display_order = COALESCE($4, display_order),
        category = COALESCE($5, category),
        description = COALESCE($6, description),
        is_active = COALESCE($7, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8`,
      [
        field_label, default_value,
        is_required !== undefined ? (is_required ? true : false) : null,
        display_order, category, description,
        is_active !== undefined ? (is_active ? true : false) : null,
        id,
      ]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    res.json({ message: 'Custom field updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/custom-fields/manage/:id
app.delete('/api/custom-fields/manage/:id', verifyToken, checkRole(['super_admin', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run(
      'UPDATE custom_fields SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    res.json({ message: 'Custom field deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/custom-fields/:tableName/:recordId/values
app.get('/api/custom-fields/:tableName/:recordId/values', verifyToken, async (req, res) => {
  const { tableName, recordId } = req.params;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    const values = await db.all(
      `SELECT
        cf.id, cf.field_name, cf.field_label, cf.field_type, cf.category,
        cfv.field_value
      FROM custom_fields cf
      LEFT JOIN custom_field_values cfv
        ON cf.id = cfv.custom_field_id
        AND cfv.record_id = $1
        AND cfv.table_name = $2
      WHERE cf.table_name = $3 AND cf.is_active = true
      ORDER BY cf.display_order ASC`,
      [recordId, tableName, tableName]
    );
    return res.json(values);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-fields/:tableName/:recordId/values
app.post('/api/custom-fields/:tableName/:recordId/values', verifyToken, async (req, res) => {
  const { tableName, recordId } = req.params;
  const { values } = req.body;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  if (!Array.isArray(values)) {
    return res.status(400).json({ error: 'Values must be an array' });
  }

  try {
    for (const { field_id, field_value } of values) {
      await db.run(
        `INSERT INTO custom_field_values
          (custom_field_id, record_id, table_name, field_value, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT(custom_field_id, record_id, table_name)
        DO UPDATE SET
          field_value = EXCLUDED.field_value,
          updated_at = CURRENT_TIMESTAMP`,
        [field_id, recordId, tableName, field_value]
      );
    }

    return res.json({ message: 'Custom field values saved successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-fields/sync-to-google-form/:tableName
app.post('/api/custom-fields/sync-to-google-form/:tableName', verifyToken, checkRole(['super_admin', 'admin']), async (req, res) => {
  const { tableName } = req.params;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const webhookUrl = process.env.GOOGLE_FORM_SYNC_WEBHOOK_URL;
  const apiSecret = process.env.GOOGLE_FORM_SYNC_SECRET || 'your-shared-secret-key';

  if (!webhookUrl) {
    return res.status(500).json({
      error: 'Google Form sync webhook URL not configured',
      hint: 'Set GOOGLE_FORM_SYNC_WEBHOOK_URL in environment variables',
    });
  }

  try {
    const fields = await db.all(
      `SELECT * FROM custom_fields
      WHERE table_name = $1 AND is_active = true
      ORDER BY display_order ASC, created_at ASC`,
      [tableName]
    );

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: apiSecret,
        tableName,
        customFields: fields,
      }),
    });

    const data = await response.json();

    if (data.success) {
      res.json({
        success: true,
        message: `Successfully synced ${fields.length} custom fields to Google Form`,
        details: data.details,
      });
    } else {
      res.status(500).json({
        success: false,
        error: data.error || 'Unknown error from Google Form',
      });
    }
  } catch (err) {
    console.error('Google Form webhook error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to sync with Google Form',
      details: err.message,
    });
  }
});

module.exports = app;
