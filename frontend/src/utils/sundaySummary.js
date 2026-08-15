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
