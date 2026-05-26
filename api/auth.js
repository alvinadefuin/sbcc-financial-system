const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('./_lib/database');
const { authenticateToken, requireRole, cors, JWT_SECRET } = require('./_lib/auth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, pwa } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: pwa ? '30d' : '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profile_picture: user.profile_picture,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
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

// GET /api/auth/google/config
app.get('/api/auth/google/config', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const configured = !!(clientId && process.env.GOOGLE_CLIENT_SECRET);
  res.json({ clientId, configured });
});

// POST /api/auth/google
app.post('/api/auth/google', async (req, res) => {
  const { googleToken } = req.body;

  if (!googleToken) {
    return res.status(400).json({ error: 'Google token is required' });
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: googleToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload.email_verified) {
      return res.status(401).json({ error: 'Email not verified by Google' });
    }

    const googleUser = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      profilePicture: payload.picture,
    };

    const existingUser = await db.get(
      'SELECT * FROM users WHERE email = $1 OR google_id = $2',
      [googleUser.email, googleUser.googleId]
    );

    if (existingUser) {
      if (!existingUser.is_active) {
        return res.status(401).json({ error: 'Account is disabled' });
      }

      await db.run(
        `UPDATE users SET
         google_id = $1, name = $2, profile_picture = $3,
         last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [googleUser.googleId, googleUser.name, googleUser.profilePicture, existingUser.id]
      );

      const token = jwt.sign(
        { id: existingUser.id, email: existingUser.email, role: existingUser.role, name: googleUser.name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        token,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: googleUser.name,
          role: existingUser.role,
          profile_picture: googleUser.profilePicture,
        },
      });
    } else {
      return res.status(403).json({
        error: 'Access denied. Please contact an administrator to get access.',
        email: googleUser.email,
      });
    }
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Middleware to verify token for user routes
function verifyJWT(req, res, next) {
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

function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// GET /api/auth/users
app.get('/api/auth/users', verifyJWT, checkRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const users = await db.all(
      'SELECT id, email, name, role, profile_picture, is_active, last_login, created_at, created_by FROM users ORDER BY created_at DESC',
      []
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/auth/users
app.post('/api/auth/users', verifyJWT, checkRole(['super_admin', 'admin']), async (req, res) => {
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
});

// PUT /api/auth/users/:id
app.put('/api/auth/users/:id', verifyJWT, checkRole(['super_admin', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { name, role, is_active } = req.body;

  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify super administrator accounts' });
    }

    if (role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super administrators can grant admin privileges' });
    }

    if (user.email === req.user.email && is_active === false) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role !== undefined && role !== 'super_admin') {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/auth/users/:id
app.delete('/api/auth/users/:id', verifyJWT, checkRole(['super_admin']), async (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const result = await db.run(
      "DELETE FROM users WHERE id = $1 AND role != 'super_admin'",
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found or cannot be deleted' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = app;
