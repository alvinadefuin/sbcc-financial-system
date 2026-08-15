// Pure helpers for the Sunday collection summary message.
// No React, no network, no Date construction from ISO strings — see toDateKey.

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/**
 * Normalise a record's date to a 'YYYY-MM-DD' key.
 *
 * Deliberately string-sliced rather than parsed: `new Date('2026-08-02')` is
 * UTC midnight, which renders as August 1 in Manila and would put the wrong
 * date on every message.
 */
export function toDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/** '2026-08-02' -> 'AUGUST 02, 2026' */
export function formatDateHeading(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${day}, ${year}`;
}

/** Set of 'YYYY-MM-DD' keys that have at least one record. */
export function collectionDatesInMonth(records) {
  const dates = new Set();
  (records || []).forEach((record) => {
    const key = toDateKey(record.date);
    if (key) dates.add(key);
  });
  return dates;
}

/** The one custom field with no backing column. Retired; never a category line. */
export const GCASH_FIELD = 'gcash';

/**
 * Read an amount off a record.
 *
 * The column wins when it exists: records created on desktop write columns but
 * no custom_field_values row, so the nested copy reads 0 while the column holds
 * the real amount.
 */
function readValue(record, fieldName) {
  const direct = record[fieldName];
  if (direct !== undefined && direct !== null) return Number(direct) || 0;
  return Number(record.custom_fields?.[fieldName]) || 0;
}

/**
 * Active decimal definitions in display order, excluding `gcash`.
 *
 * `gcash` is excluded by name rather than by relying on it being deactivated:
 * deactivation is a config action an admin could undo, and the exclusion is
 * what guarantees GCash money is never reported twice.
 */
export function amountFields(fieldDefs) {
  return (fieldDefs || [])
    .filter((field) => field.field_type === 'decimal')
    .filter((field) => field.is_active !== 0 && field.is_active !== false)
    .filter((field) => field.field_name !== GCASH_FIELD)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/** Aggregate every record for one date into { dateKey, lines, total, unattributed }. */
export function buildSummary(records, fieldDefs, dateKey) {
  const forDate = (records || []).filter((record) => toDateKey(record.date) === dateKey);
  const fields = amountFields(fieldDefs);

  const lines = [];
  fields.forEach((field) => {
    const amount = forDate.reduce((sum, record) => sum + readValue(record, field.field_name), 0);
    if (amount > 0) lines.push({ label: field.field_label, amount });
  });

  return { dateKey, lines, total: 0, unattributed: 0 };
}
