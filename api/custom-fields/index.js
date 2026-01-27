const db = require('../_lib/database');
const { cors, requireRole } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method === 'POST') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
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
    })(req, res);
  }

  res.status(405).end();
});
