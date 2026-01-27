const db = require('../../_lib/database');
const { cors } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await db.get(
      'SELECT id, email, name, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found', canSubmit: false });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled', canSubmit: false });
    }

    if (user.role !== 'user') {
      return res.status(403).json({ error: 'Only members can submit forms', canSubmit: false });
    }

    res.json({
      canSubmit: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
