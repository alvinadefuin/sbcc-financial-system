// Shared presentation rules for record lists. The desktop table and the mobile
// Recent feed both order and label the same rows, so the rules live in one
// place rather than being written twice and drifting.

/**
 * A record's human-facing reference. Collections carry `control_number`,
 * expenses carry `forms_number`.
 *
 * `type` exists because the desktop table knows the kind from its active tab
 * rather than from the row, and rows fetched there have no `entryType`.
 */
export function referenceOf(entry, type) {
  if (!entry) return '';
  const kind = type || entry.entryType;
  const field = kind === 'expense' ? 'forms_number' : 'control_number';
  return entry[field] || '';
}

// Milliseconds a record was submitted, or null when nothing usable is stored.
// Rows predating created_at fall back to the collection date so they still
// order sensibly instead of collapsing to the bottom.
function submittedAt(entry) {
  const raw = entry?.created_at || entry?.date;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Order records for display. Pure — returns a new array.
 *
 * `key` is 'submitted' (default) or 'reference'; `direction` is 'desc'
 * (default) or 'asc'. Direction applies to the primary key only: the
 * tie-break is always ascending, so flipping direction never reshuffles rows
 * that compare equal. Rows missing the primary key sort last either way — a
 * record with no reference should not lead the list just because the arrow
 * flipped.
 */
export function sortRecords(rows, { key = 'submitted', direction = 'desc', type } = {}) {
  const dir = direction === 'asc' ? 1 : -1;
  const ref = (r) => referenceOf(r, type);

  return [...(rows || [])].sort((a, b) => {
    if (key === 'reference') {
      const ra = ref(a);
      const rb = ref(b);
      if (ra && rb) {
        const cmp = ra.localeCompare(rb);
        if (cmp !== 0) return cmp * dir;
      } else if (ra || rb) {
        return ra ? -1 : 1;
      }
      const sa = submittedAt(a);
      const sb = submittedAt(b);
      if (sa === null || sb === null) return 0;
      return sa - sb;
    }

    const sa = submittedAt(a);
    const sb = submittedAt(b);
    if (sa !== null && sb !== null) {
      if (sa !== sb) return (sa - sb) * dir;
    } else if (sa !== null || sb !== null) {
      return sa !== null ? -1 : 1;
    }
    return ref(a).localeCompare(ref(b));
  });
}

/**
 * "Aug 16, 2026 · 12:41 PM" — the moment a record was submitted, in the
 * reader's own timezone.
 *
 * `timeZone` is for tests, which need a fixed zone to assert against.
 * Production passes nothing and gets the device's, which is what a collector
 * in Manila should see.
 */
export function formatSubmittedAt(entry, { timeZone } = {}) {
  const dateOpts = { month: 'short', day: 'numeric', year: 'numeric', timeZone };

  const stamp = entry?.created_at;
  if (stamp) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) {
      const day = d.toLocaleDateString('en-US', dateOpts);
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
      return `${day} · ${time}`;
    }
  }

  const fallback = entry?.date;
  if (fallback) {
    const d = new Date(fallback);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', dateOpts);
  }

  return '—';
}
