const jwt = require('jsonwebtoken');
const db = require('../_lib/database');
const { cors, JWT_SECRET } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get(
      'SELECT id, email, name, role, profile_picture, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
});
