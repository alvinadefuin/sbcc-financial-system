const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

/**
 * Express middleware: verifies the bearer token and sets req.user.
 * 401 when no token is supplied, 403 when the token is invalid.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
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
