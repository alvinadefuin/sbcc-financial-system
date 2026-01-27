const db = require('../../_lib/database');
const { cors, requireRole } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method === 'GET') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
      try {
        const users = await db.all(
          'SELECT id, email, name, role, profile_picture, is_active, last_login, created_at, created_by FROM users ORDER BY created_at DESC',
          []
        );
        res.json(users);
      } catch (err) {
        res.status(500).json({ error: 'Database error' });
      }
    })(req, res);
  }

  if (req.method === 'POST') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
      const { email, name, role = 'user' } = req.body;

      if (!email || !name) {
        return res.status(400).json({ error: 'Email and name are required' });
      }

      if (role === 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super administrators can create admin users' });
      }

      if (role === 'super_admin') {
        return res.status(403).json({ error: 'Cannot create super admin users through API' });
      }

      try {
        const result = await db.run(
          'INSERT INTO users (email, name, role, created_by) VALUES ($1, $2, $3, $4)',
          [email, name, role, req.user.email]
        );

        res.json({
          id: result.lastID,
          message: 'User created successfully',
          email,
          name,
          role,
        });
      } catch (err) {
        if (err.message && err.message.includes('unique')) {
          return res.status(400).json({ error: 'User with this email already exists' });
        }
        res.status(500).json({ error: 'Failed to create user' });
      }
    })(req, res);
  }

  res.status(405).end();
});
