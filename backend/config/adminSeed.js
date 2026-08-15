const crypto = require("crypto");

const DEFAULT_ADMIN_EMAIL = "admin@sbcc.church";

/**
 * Resolve the credentials used to seed the initial super_admin account.
 *
 * The password is never hardcoded: it comes from ADMIN_PASSWORD, and when that
 * is unset we generate a random one so a fresh install can never come up with a
 * publicly known default. Seeding is INSERT-OR-IGNORE, so this only ever
 * applies to a database that has no admin yet.
 */
function resolveAdminCredentials(env = process.env) {
  const email = env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  const configured =
    typeof env.ADMIN_PASSWORD === "string" && env.ADMIN_PASSWORD.length > 0;

  return {
    email,
    password: configured
      ? env.ADMIN_PASSWORD
      : crypto.randomBytes(24).toString("base64url"),
    generated: !configured,
  };
}

module.exports = { resolveAdminCredentials, DEFAULT_ADMIN_EMAIL };
