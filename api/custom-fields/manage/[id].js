const db = require('../../_lib/database');
const { cors, requireRole } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'PUT') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
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
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
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
    })(req, res);
  }

  res.status(405).end();
});
