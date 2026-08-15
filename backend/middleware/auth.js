const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

/**
 * The local server's single auth middleware. Six route files previously kept
 * private copies of this; they all delegate here so the token-version check
 * exists in one place.
 *
 * 401 for a missing or revoked token, 403 for a malformed or expired one. The
 * split matters: the frontend clears the session on 401 only.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.sendStatus(403);
  }

  let settled = false;
  const decide = (err, row) => {
    if (settled) return;
    settled = true;

    if (err) {
      console.error("Token version check failed:", err.message);
      return res.status(500).json({ error: "Authentication check failed" });
    }
    // A token minted before this feature carries no tv; 0 matches the column
    // default, so deploying does not sign everyone out.
    if (!row || (claims.tv ?? 0) !== (row.token_version ?? 0)) {
      return res
        .status(401)
        .json({ error: "Session expired. Please sign in again.", code: "TOKEN_REVOKED" });
    }
    req.user = claims;
    next();
  };

  // req.db is callback-style in the running server, but some routes are driven
  // with a promise-style db. Accept either, and settle exactly once.
  const pending = req.db.get(
    "SELECT token_version FROM users WHERE id = ?",
    [claims.id],
    decide
  );

  if (pending && typeof pending.then === "function") {
    pending.then((row) => decide(null, row)).catch((err) => decide(err));
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, checkRole: requireRole, JWT_SECRET };
