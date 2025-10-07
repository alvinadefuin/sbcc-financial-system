/**
 * Helper functions for managing custom fields
 */

/**
 * Fetch custom field values for a record
 * @param {Object} db - Database instance
 * @param {string} tableName - 'collections' or 'expenses'
 * @param {number} recordId - Record ID
 * @returns {Promise<Object>} Object with field_name as keys and field_value as values
 */
function getCustomFieldValues(db, tableName, recordId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        cf.field_name,
        cf.field_type,
        COALESCE(cfv.field_value, cf.default_value) as field_value
      FROM custom_fields cf
      LEFT JOIN custom_field_values cfv
        ON cf.id = cfv.custom_field_id
        AND cfv.record_id = ?
        AND cfv.table_name = ?
      WHERE cf.table_name = ? AND cf.is_active = 1
    `;

    db.all(query, [recordId, tableName, tableName], (err, rows) => {
      if (err) {
        return reject(err);
      }

      // Convert to a simple object
      const customFields = {};
      rows.forEach(row => {
        // Convert value based on field type
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
            // 'text' and 'date' remain as strings
          }
        }
        customFields[row.field_name] = value;
      });

      resolve(customFields);
    });
  });
}

/**
 * Save custom field values for a record
 * @param {Object} db - Database instance
 * @param {string} tableName - 'collections' or 'expenses'
 * @param {number} recordId - Record ID
 * @param {Object} customFields - Object with field_name as keys and values to save
 * @returns {Promise<void>}
 */
function saveCustomFieldValues(db, tableName, recordId, customFields) {
  return new Promise((resolve, reject) => {
    if (!customFields || Object.keys(customFields).length === 0) {
      return resolve();
    }

    // First, get the field definitions to map field names to IDs
    const getFieldsQuery = `
      SELECT id, field_name FROM custom_fields
      WHERE table_name = ? AND is_active = 1
    `;

    db.all(getFieldsQuery, [tableName], (err, fields) => {
      if (err) {
        return reject(err);
      }

      // Create a map of field_name to field_id
      const fieldMap = {};
      fields.forEach(field => {
        fieldMap[field.field_name] = field.id;
      });

      // Prepare values to insert/update
      const valuesToSave = [];
      Object.keys(customFields).forEach(fieldName => {
        const fieldId = fieldMap[fieldName];
        if (fieldId) {
          valuesToSave.push({
            fieldId,
            value: customFields[fieldName]
          });
        }
      });

      if (valuesToSave.length === 0) {
        return resolve();
      }

      // Use a transaction to save all values
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);
        });

        let completed = 0;
        let hasError = false;

        valuesToSave.forEach(({ fieldId, value }) => {
          const query = `
            INSERT INTO custom_field_values
              (custom_field_id, record_id, table_name, field_value, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(custom_field_id, record_id, table_name)
            DO UPDATE SET
              field_value = excluded.field_value,
              updated_at = CURRENT_TIMESTAMP
          `;

          db.run(query, [fieldId, recordId, tableName, String(value)], (err) => {
            if (err && !hasError) {
              hasError = true;
              db.run('ROLLBACK');
              return reject(err);
            }

            completed++;

            if (completed === valuesToSave.length && !hasError) {
              db.run('COMMIT', (err) => {
                if (err) {
                  return reject(err);
                }
                resolve();
              });
            }
          });
        });
      });
    });
  });
}

/**
 * Fetch records with custom field values
 * @param {Object} db - Database instance
 * @param {string} tableName - 'collections' or 'expenses'
 * @param {Array} records - Array of records from the main table
 * @returns {Promise<Array>} Records with custom_fields property added
 */
async function enrichRecordsWithCustomFields(db, tableName, records) {
  const enriched = await Promise.all(
    records.map(async (record) => {
      try {
        const customFields = await getCustomFieldValues(db, tableName, record.id);
        return {
          ...record,
          custom_fields: customFields
        };
      } catch (err) {
        console.error(`Error fetching custom fields for ${tableName} record ${record.id}:`, err);
        return {
          ...record,
          custom_fields: {}
        };
      }
    })
  );
  return enriched;
}

module.exports = {
  getCustomFieldValues,
  saveCustomFieldValues,
  enrichRecordsWithCustomFields
};
