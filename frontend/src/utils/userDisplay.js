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
