// Naming and ordering rules for user rows. The desktop table, the desktop
// shell, and the mobile header all label the same person, so the rules live in
// one place rather than being written three times and drifting.

// The part of an email before the @, or the whole string when there is no @.
function localPart(email) {
  if (typeof email !== 'string') return '';
  const at = email.indexOf('@');
  return (at === -1 ? email : email.slice(0, at)).trim();
}

/**
 * What to call a user.
 *
 * `name` is filled by Google on first sign-in, so an account that was created
 * but never signed into has none. Falsiness is the test rather than
 * `!== null`: the column is `TEXT NOT NULL`, so a nameless account stores an
 * empty string, and testing truthiness keeps this correct if the column is
 * ever relaxed to nullable.
 */
export function displayName(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name) return name;
  return localPart(user?.email) || 'Unknown';
}

/** The avatar letter. Derived from displayName so the two can never disagree. */
export function initialOf(user) {
  return displayName(user).charAt(0).toUpperCase();
}

// Rank, not spelling. Sorting roles alphabetically would put `admin` and
// `super_admin` on either side of `user`, which reads as noise.
const ROLE_RANK = { super_admin: 3, admin: 2, user: 1 };

// Milliseconds, or null when nothing usable is stored.
function timeOf(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Order users for display. Pure — returns a new array.
 *
 * `key` is 'created' (default), 'name', 'role', or 'last_login'; `direction`
 * is 'desc' (default) or 'asc'. Direction applies to the primary key only: the
 * tie-break is always display name ascending, so flipping direction never
 * reshuffles rows that compare equal. Rows with no last login sort last either
 * way — a never-signed-in account should not lead the list just because the
 * arrow flipped. This mirrors `utils/records.js`; two sort helpers that
 * disagreed about direction or tie-breaks would be worse than one.
 */
export function sortUsers(users, { key = 'created', direction = 'desc' } = {}) {
  const dir = direction === 'asc' ? 1 : -1;
  const byName = (a, b) =>
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });

  return [...(users || [])].sort((a, b) => {
    if (key === 'name') {
      return byName(a, b) * dir;
    }

    if (key === 'role') {
      const ra = ROLE_RANK[a?.role] || 0;
      const rb = ROLE_RANK[b?.role] || 0;
      if (ra !== rb) return (ra - rb) * dir;
      return byName(a, b);
    }

    const field = key === 'last_login' ? 'last_login' : 'created_at';
    const ta = timeOf(a?.[field]);
    const tb = timeOf(b?.[field]);
    if (ta !== null && tb !== null) {
      if (ta !== tb) return (ta - tb) * dir;
    } else if (ta !== null || tb !== null) {
      return ta !== null ? -1 : 1;
    }
    return byName(a, b);
  });
}
