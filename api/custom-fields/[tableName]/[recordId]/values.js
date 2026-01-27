const db = require('../../../_lib/database');
const { cors, authenticateToken } = require('../../../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  const { tableName, recordId } = req.query;

  if (!['collections', 'expenses'].includes(tableName)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  if (req.method === 'GET') {
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
  }

  if (req.method === 'POST') {
    const { values } = req.body;

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
  }

  res.status(405).end();
}));
