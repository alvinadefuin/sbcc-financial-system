const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const { assertTokenCurrent } = require('./tokenVersion');

/**
 * Express middleware: verifies the bearer token and sets req.user.
 * 401 when no token is supplied or the token has been revoked, 403 when the
 * token is malformed or expired.
 *
 * A revoked token answers 401 deliberately: the frontend's axios interceptor
 * clears the session and redirects on 401 only, so a 403 here would strand the
 * user in a dashboard where every request fails.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    if (!(await assertTokenCurrent(claims))) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_REVOKED' });
    }
  } catch (err) {
    console.error('Token version check failed:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  req.user = claims;
  next();
}

/**
 * Express middleware factory: requires req.user.role to be one of `roles`.
 * Must run after verifyToken.
 */
function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, checkRole };
