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

/** Label for the Gcash line. Not taken from field defs — the field is retired. */
export const GCASH_LABEL = 'Gcash';

/** GCash money is any record whose payment method is GCash. */
export function isGcashRecord(record) {
  return String(record.payment_method || '').trim().toLowerCase() === 'gcash';
}

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
  const gcashRecords = forDate.filter(isGcashRecord);
  const otherRecords = forDate.filter((record) => !isGcashRecord(record));

  const lines = [];
  fields.forEach((field) => {
    const amount = otherRecords.reduce((sum, record) => sum + readValue(record, field.field_name), 0);
    if (amount > 0) lines.push({ label: field.field_label, amount });
  });

  // Sum every field on a GCash record, not just tithes: records that predate
  // the mobile form restriction may carry amounts in other categories, and
  // those categories are never rendered for GCash records.
  const gcashAmount = gcashRecords.reduce((sum, record) => {
    const breakdown = fields.reduce((inner, field) => inner + readValue(record, field.field_name), 0);
    return sum + (breakdown > 0 ? breakdown : Number(record.total_amount) || 0);
  }, 0);
  if (gcashAmount > 0) lines.push({ label: GCASH_LABEL, amount: gcashAmount });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const recorded = forDate.reduce((sum, record) => sum + (Number(record.total_amount) || 0), 0);

  // Can be negative: records saved before the gcash field was retired have a
  // total_amount that already omits the amount. Only a positive gap is a
  // warning worth showing — see the shells.
  return { dateKey, lines, total, unattributed: recorded - total };
}

export const CLOSING_LINE =
  'Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at pagtatapat sa pagkakaloob!';

/** 18100 -> '18,100.00' */
export function formatPeso(amount) {
  return Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Render the message, one blank line between every block. */
export function formatSummaryText(summary) {
  const blocks = [
    `SBCC SUNDAY COLLECTION\nDate : ${formatDateHeading(summary.dateKey)}`,
    ...summary.lines.map((line) => `${line.label} - Php ${formatPeso(line.amount)}`),
    `Total Collection: Php ${formatPeso(summary.total)}`,
    CLOSING_LINE,
  ];
  return blocks.join('\n\n');
}
