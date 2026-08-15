// Zero-dependency on purpose: backend/routes/ requires this file directly, and
// pulling in api/_lib/database.js would instantiate a second pg Pool inside the
// local Express server, which already manages its own connection.

/**
 * SQL predicate selecting only live (non-soft-deleted) rows.
 * Pass a table alias whenever the query touches more than one table.
 *
 * Placement rules:
 *   - building a whereConditions array -> whereConditions.push(notDeleted())
 *   - an existing WHERE clause          -> ` AND ${notDeleted()}`
 *   - a LEFT JOIN                       -> inside the ON clause, never the WHERE
 */
function notDeleted(alias) {
  return alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL';
}

module.exports = { notDeleted };
