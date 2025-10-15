const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../config/database').getDatabase();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Get all custom fields for a specific table
router.get('/:tableName', authenticate, (req, res) => {
  const { tableName } = req.params;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const query = `
    SELECT * FROM custom_fields
    WHERE table_name = ? AND is_active = 1
    ORDER BY display_order ASC, created_at ASC
  `;

  db.all(query, [tableName], (err, fields) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(fields);
  });
});

// Get custom field values for a specific record
router.get('/:tableName/:recordId/values', authenticate, (req, res) => {
  const { tableName, recordId } = req.params;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const query = `
    SELECT
      cf.id,
      cf.field_name,
      cf.field_label,
      cf.field_type,
      cf.category,
      cfv.field_value
    FROM custom_fields cf
    LEFT JOIN custom_field_values cfv
      ON cf.id = cfv.custom_field_id
      AND cfv.record_id = ?
      AND cfv.table_name = ?
    WHERE cf.table_name = ? AND cf.is_active = 1
    ORDER BY cf.display_order ASC
  `;

  db.all(query, [recordId, tableName, tableName], (err, values) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(values);
  });
});

// Create a new custom field (admin only)
router.post('/', authenticate, (req, res) => {
  const { user } = req;

  // Check if user is admin
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only admins can create custom fields' });
  }

  const {
    table_name,
    field_name,
    field_label,
    field_type,
    default_value,
    is_required,
    display_order,
    category,
    description
  } = req.body;

  // Validate required fields
  if (!table_name || !field_name || !field_label || !field_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate table_name
  if (!['collections', 'expenses'].includes(table_name)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  // Validate field_type
  const validTypes = ['decimal', 'text', 'date', 'integer', 'boolean'];
  if (!validTypes.includes(field_type)) {
    return res.status(400).json({ error: 'Invalid field type' });
  }

  // Validate field_name format (alphanumeric and underscores only)
  if (!/^[a-z][a-z0-9_]*$/.test(field_name)) {
    return res.status(400).json({
      error: 'Field name must start with a letter and contain only lowercase letters, numbers, and underscores'
    });
  }

  const query = `
    INSERT INTO custom_fields (
      table_name, field_name, field_label, field_type,
      default_value, is_required, display_order, category,
      description, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  db.run(
    query,
    [
      table_name,
      field_name,
      field_label,
      field_type,
      default_value || null,
      is_required ? 1 : 0,
      display_order || 0,
      category || null,
      description || null,
      user.email
    ],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Field name already exists for this table' });
        }
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: this.lastID,
        message: 'Custom field created successfully'
      });
    }
  );
});

// Update a custom field (admin only)
router.put('/:id', authenticate, (req, res) => {
  const { user } = req;
  const { id } = req.params;

  // Check if user is admin
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only admins can update custom fields' });
  }

  const {
    field_label,
    default_value,
    is_required,
    display_order,
    category,
    description,
    is_active
  } = req.body;

  const query = `
    UPDATE custom_fields
    SET
      field_label = COALESCE(?, field_label),
      default_value = COALESCE(?, default_value),
      is_required = COALESCE(?, is_required),
      display_order = COALESCE(?, display_order),
      category = COALESCE(?, category),
      description = COALESCE(?, description),
      is_active = COALESCE(?, is_active),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(
    query,
    [
      field_label,
      default_value,
      is_required !== undefined ? (is_required ? 1 : 0) : null,
      display_order,
      category,
      description,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Custom field not found' });
      }

      res.json({ message: 'Custom field updated successfully' });
    }
  );
});

// Delete a custom field (soft delete - admin only)
router.delete('/:id', authenticate, (req, res) => {
  const { user } = req;
  const { id } = req.params;

  // Check if user is admin
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only admins can delete custom fields' });
  }

  const query = `
    UPDATE custom_fields
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Custom field not found' });
    }

    res.json({ message: 'Custom field deleted successfully' });
  });
});

// Save custom field values for a record
router.post('/:tableName/:recordId/values', authenticate, (req, res) => {
  const { tableName, recordId } = req.params;
  const { values } = req.body; // Array of { field_id, field_value }

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  if (!Array.isArray(values)) {
    return res.status(400).json({ error: 'Values must be an array' });
  }

  // Use a transaction to save all values
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    let hasError = false;
    let processedCount = 0;

    values.forEach(({ field_id, field_value }) => {
      if (hasError) return;

      const query = `
        INSERT INTO custom_field_values
          (custom_field_id, record_id, table_name, field_value, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(custom_field_id, record_id, table_name)
        DO UPDATE SET
          field_value = excluded.field_value,
          updated_at = CURRENT_TIMESTAMP
      `;

      db.run(query, [field_id, recordId, tableName, field_value], function(err) {
        if (err && !hasError) {
          hasError = true;
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }

        processedCount++;

        if (processedCount === values.length && !hasError) {
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Custom field values saved successfully' });
          });
        }
      });
    });

    // Handle empty values array
    if (values.length === 0) {
      db.run('COMMIT');
      res.json({ message: 'No values to save' });
    }
  });
});

// Sync custom fields to Google Form (admin only)
router.post('/sync-to-google-form/:tableName', authenticate, async (req, res) => {
  const { user } = req;
  const { tableName } = req.params;

  // Check if user is admin
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only admins can sync to Google Form' });
  }

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  // Get webhook URL from environment
  const webhookUrl = process.env.GOOGLE_FORM_SYNC_WEBHOOK_URL;
  const apiSecret = process.env.GOOGLE_FORM_SYNC_SECRET || 'your-shared-secret-key';

  if (!webhookUrl) {
    return res.status(500).json({
      error: 'Google Form sync webhook URL not configured',
      hint: 'Set GOOGLE_FORM_SYNC_WEBHOOK_URL in .env file'
    });
  }

  try {
    // Get all active custom fields for this table
    const query = `
      SELECT * FROM custom_fields
      WHERE table_name = ? AND is_active = 1
      ORDER BY display_order ASC, created_at ASC
    `;

    db.all(query, [tableName], async (err, fields) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Send fields to Google Apps Script webhook
      const axios = require('axios');
      try {
        const response = await axios.post(webhookUrl, {
          secret: apiSecret,
          tableName: tableName,
          customFields: fields
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000 // 30 second timeout
        });

        if (response.data.success) {
          res.json({
            success: true,
            message: `Successfully synced ${fields.length} custom fields to Google Form`,
            details: response.data.details
          });
        } else {
          res.status(500).json({
            success: false,
            error: response.data.error || 'Unknown error from Google Form'
          });
        }
      } catch (webhookError) {
        console.error('Google Form webhook error:', webhookError);
        res.status(500).json({
          success: false,
          error: 'Failed to sync with Google Form',
          details: webhookError.message
        });
      }
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
