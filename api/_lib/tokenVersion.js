const db = require('./database');

/**
 * True when the caller's token is still the current one for that user.
 *
 * Revocation works by incrementing users.token_version; a token carries the
 * value it was minted with in its `tv` claim. A token minted before this
 * feature existed has no `tv` at all — that is treated as 0, which matches the
 * column default, so deploying this does not sign everyone out. A user whose
 * version has since been bumped no longer matches, and their old tokens fail.
 *
 * This is one extra read per authenticated request. It is the whole mechanism
 * by which a lost device can be cut off, so it runs on every authenticated
 * route rather than only on sensitive ones.
 */
async function assertTokenCurrent(user) {
  if (!user || user.id === undefined || user.id === null) return false;

  const row = await db.get('SELECT token_version FROM users WHERE id = $1', [user.id]);
  if (!row) return false;

  return (user.tv ?? 0) === (row.token_version ?? 0);
}

module.exports = { assertTokenCurrent };
