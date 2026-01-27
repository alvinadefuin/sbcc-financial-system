const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

/**
 * Wraps a handler with JWT authentication.
 * Sets req.user on success, returns 401/403 on failure.
 */
function authenticateToken(handler) {
  return async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const user = jwt.verify(token, JWT_SECRET);
      req.user = user;
      return handler(req, res);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  };
}

/**
 * Wraps a handler with role-based access control.
 * Must be used after authenticateToken.
 */
function requireRole(roles, handler) {
  return authenticateToken(async (req, res) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return handler(req, res);
  });
}

/**
 * Allow specific HTTP methods, return 405 for others.
 */
function allowMethods(methods, handler) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).end();
    }
    return handler(req, res);
  };
}

/**
 * Set CORS headers for serverless functions.
 */
function cors(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    return handler(req, res);
  };
}

module.exports = { authenticateToken, requireRole, allowMethods, cors, JWT_SECRET };
