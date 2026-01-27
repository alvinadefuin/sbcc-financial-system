const bcrypt = require('bcryptjs');
const db = require('../_lib/database');
const { cors } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  const defaultPassword = bcrypt.hashSync('member123', 10);

  try {
    const result = await db.run(
      `INSERT INTO users (email, name, role, password_hash, is_active, created_by)
       VALUES ($1, $2, 'user', $3, true, 'system')
       ON CONFLICT (email) DO NOTHING`,
      [email, name, defaultPassword]
    );

    if (result.changes === 0) {
      return res.json({ message: 'User already exists', email });
    }

    res.json({
      success: true,
      message: 'Test user created successfully',
      email, name,
      password: 'member123',
      user_id: result.lastID,
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});
