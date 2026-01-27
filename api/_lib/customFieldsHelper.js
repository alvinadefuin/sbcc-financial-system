const db = require('./database');

/**
 * Fetch custom field values for a record
 */
async function getCustomFieldValues(tableName, recordId) {
  const query = `
    SELECT
      cf.field_name,
      cf.field_type,
      COALESCE(cfv.field_value, cf.default_value) as field_value
    FROM custom_fields cf
    LEFT JOIN custom_field_values cfv
      ON cf.id = cfv.custom_field_id
      AND cfv.record_id = $1
      AND cfv.table_name = $2
    WHERE cf.table_name = $3 AND cf.is_active = true
  `;

  const rows = await db.all(query, [recordId, tableName, tableName]);

  const customFields = {};
  rows.forEach(row => {
    let value = row.field_value;
    if (value !== null && value !== undefined) {
      switch (row.field_type) {
        case 'decimal':
        case 'integer':
          value = parseFloat(value) || 0;
          break;
        case 'boolean':
          value = value === 'true' || value === '1' || value === 1;
          break;
      }
    }
    customFields[row.field_name] = value;
  });

  return customFields;
}

/**
 * Save custom field values for a record
 */
async function saveCustomFieldValues(tableName, recordId, customFields) {
  if (!customFields || Object.keys(customFields).length === 0) {
    return;
  }

  const fields = await db.all(
    `SELECT id, field_name FROM custom_fields WHERE table_name = $1 AND is_active = true`,
    [tableName]
  );

  const fieldMap = {};
  fields.forEach(field => {
    fieldMap[field.field_name] = field.id;
  });

  for (const [fieldName, value] of Object.entries(customFields)) {
    const fieldId = fieldMap[fieldName];
    if (fieldId) {
      await db.run(
        `INSERT INTO custom_field_values
          (custom_field_id, record_id, table_name, field_value, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT(custom_field_id, record_id, table_name)
        DO UPDATE SET
          field_value = EXCLUDED.field_value,
          updated_at = CURRENT_TIMESTAMP`,
        [fieldId, recordId, tableName, String(value)]
      );
    }
  }
}

/**
 * Enrich records with custom field values
 */
async function enrichRecordsWithCustomFields(tableName, records) {
  const enriched = await Promise.all(
    records.map(async (record) => {
      try {
        const customFields = await getCustomFieldValues(tableName, record.id);
        return { ...record, custom_fields: customFields };
      } catch (err) {
        console.error(`Error fetching custom fields for ${tableName} record ${record.id}:`, err);
        return { ...record, custom_fields: {} };
      }
    })
  );
  return enriched;
}

module.exports = {
  getCustomFieldValues,
  saveCustomFieldValues,
  enrichRecordsWithCustomFields,
};
