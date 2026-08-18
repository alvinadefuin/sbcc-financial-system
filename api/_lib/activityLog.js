// Append-only activity log. Every mutation writes exactly one row through
// logActivity(), inside the same transaction as the mutation itself, so the log
// can never disagree with what happened.
//
// No application code ever UPDATEs or DELETEs from activity_log.

const ACTIONS = {
  RECORD_CREATE: 'record.create',
  RECORD_UPDATE: 'record.update',
  RECORD_DELETE: 'record.delete',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  PASSWORD_CHANGE: 'auth.password_change',
};

const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));

// Never written to `changes` or `summary`, whatever the caller passes.
const REDACTED_FIELDS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'token',
  'authorization',
]);

// The fields each PUT handler can actually change. Diffing an explicit list
// keeps generated columns and timestamps out of the log.
const COLLECTION_FIELDS = [
  'date', 'particular', 'control_number', 'payment_method', 'total_amount',
  'general_tithes_offering', 'bank_interest',
  'sisterhood_san_juan', 'sisterhood_labuin', 'brotherhood', 'youth', 'couples',
  'sunday_school', 'special_purpose_pledge',
];

// An expense is one line item, so an edit can change what it is filed against as
// well as its amount. The amount columns are listed explicitly rather than
// imported: activityLog is required by every route file, and pulling in the
// taxonomy (which requires reportService) would drag the report module into
// every request path. The list is asserted against the schema in the tests.
const EXPENSE_FIELDS = [
  'date', 'particular', 'forms_number', 'cheque_number', 'total_amount',
  'category', 'subcategory', 'fund_source',
  'pbcm_share_expense', 'pastoral_worker_support', 'cap_assistance', 'honorarium',
  'conference_seminar', 'fellowship_events', 'anniversary_christmas', 'supplies',
  'utilities', 'vehicle_maintenance', 'lto_registration', 'transportation_gas',
  'building_maintenance', 'abccop_national', 'cbcc_share', 'kabalikat_share',
  'abccop_community',
];

const USER_FIELDS = ['name', 'role', 'is_active'];

/**
 * Canonical string for comparison. PostgreSQL hands back numeric columns as
 * strings and date columns as local-midnight Date objects, while the request
 * body carries numbers and 'YYYY-MM-DD' strings — without this every edit would
 * look like it changed every field.
 */
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return String(asNumber);
  return String(value);
}

/**
 * YYYY-MM-DD for a summary line, from either a request-body string or the Date
 * object pg hands back for a `date` column. `String(dateObject).slice(0, 10)`
 * would yield "Sat Aug 15" — both servers write to the same log, so they have to
 * agree on this.
 */
function asDateString(value) {
  if (value instanceof Date) return normalize(value);
  return String(value || '').slice(0, 10);
}

/** Presentable form for storage: dates as YYYY-MM-DD, amounts as numbers. */
function forLog(value) {
  if (value === undefined || value === '') return null;
  if (value instanceof Date) return normalize(value);
  if (value === null || typeof value === 'object' || typeof value === 'boolean') return value;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && value !== '' ? asNumber : value;
}

/**
 * Field-level before/after diff, restricted to `fields` and to values the
 * update actually supplied. Returns null when nothing changed.
 */
function diffFields(before, after, fields) {
  const changes = {};

  for (const field of fields) {
    if (REDACTED_FIELDS.has(field)) continue;
    if (!after || !(field in after)) continue;
    if (normalize(before ? before[field] : null) === normalize(after[field])) continue;

    changes[field] = { from: forLog(before ? before[field] : null), to: forLog(after[field]) };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Writes one activity row.
 *
 * @param runner  Anything with run(sql, params) — pass the `tx` from
 *                db.withTransaction() for a logged mutation, or the `db` module
 *                itself for a standalone event that mutates nothing else.
 */
async function logActivity(runner, entry) {
  const { actor, action, entityType = null, entityId = null, summary = null, changes = null } = entry;

  if (!KNOWN_ACTIONS.has(action)) {
    throw new Error(`Unknown activity action: ${action}`);
  }

  await runner.run(
    `INSERT INTO activity_log (actor_email, actor_role, action, entity_type, entity_id, summary, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actor ? actor.email || null : null,
      actor ? actor.role || null : null,
      action,
      entityType,
      entityId,
      summary,
      changes ? JSON.stringify(changes) : null,
    ]
  );
}

module.exports = {
  logActivity,
  diffFields,
  asDateString,
  ACTIONS,
  REDACTED_FIELDS,
  COLLECTION_FIELDS,
  EXPENSE_FIELDS,
  USER_FIELDS,
};
