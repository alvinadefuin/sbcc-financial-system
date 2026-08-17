const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('./_lib/database');
const { logActivity, diffFields, ACTIONS, USER_FIELDS } = require('./_lib/activityLog');
const { assertTokenCurrent } = require('./_lib/tokenVersion');

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
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

    // Before bcrypt, deliberately: answering after the password check would make
    // a locked account with the right password distinguishable from one with the
    // wrong password.
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: 'Account temporarily locked after repeated failed sign-ins. Try again shortly.',
        retry_after_seconds: retryAfter,
      });
    }

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) {
        // The counter and its log entry now commit together: a failure that is
        // counted but unlogged, or logged but uncounted, would misrepresent what
        // happened.
        const attempts = (user.failed_login_attempts || 0) + 1;
        const locking = attempts >= MAX_FAILED_LOGINS;

        await db.withTransaction(async (tx) => {
          if (locking) {
            await tx.run(
              `UPDATE users SET failed_login_attempts = $1,
                 locked_until = now() + ($2 || ' minutes')::interval
               WHERE id = $3`,
              [attempts, String(LOCKOUT_MINUTES), user.id]
            );
          } else {
            await tx.run('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
          }

          await logActivity(tx, {
            actor: { email: user.email, role: user.role },
            action: ACTIONS.LOGIN_FAILED,
            summary: locking
              ? `Failed password login — account locked for ${LOCKOUT_MINUTES} minutes`
              : `Failed password login (${attempts} of ${MAX_FAILED_LOGINS})`,
          });
        });
      } else {
        // Nothing to bind this to — no account matched, so no row is mutated.
        await logActivity(db, {
          actor: null,
          action: ACTIONS.LOGIN_FAILED,
          summary: `Failed login for unknown email ${email}`,
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET last_login = CURRENT_TIMESTAMP,
           failed_login_attempts = 0, locked_until = NULL
         WHERE id = $1`,
        [user.id]
      );
      await logActivity(tx, {
        actor: { email: user.email, role: user.role },
        action: ACTIONS.LOGIN_SUCCESS,
        summary: pwa ? 'Signed in from mobile' : 'Signed in',
      });
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: user.token_version ?? 0 },
      JWT_SECRET,
      { expiresIn: pwa ? '7d' : '24h' }
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
// verifyJWT rather than a private jwt.verify: the frontend calls this on every
// page load to restore the session, so a revoked token accepted here would keep
// someone looking signed in while every other request failed.
app.get('/api/auth/me', verifyJWT, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, email, name, role, profile_picture, is_active FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Profile lookup error:', err.message);
    return res.status(500).json({ error: 'Database error' });
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
        { id: existingUser.id, email: existingUser.email, role: existingUser.role, name: googleUser.name, tv: existingUser.token_version ?? 0 },
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
async function verifyJWT(req, res, next) {
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

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (role === 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super administrators can create admin users' });
  }

  if (role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot create super admin users through API' });
  }

  try {
    let newUserId;
    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        'INSERT INTO users (email, name, role, created_by) VALUES ($1, $2, $3, $4)',
        [email, (name || '').trim(), role, req.user.email]
      );
      newUserId = result.lastID;

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.USER_CREATE,
        entityType: 'user',
        entityId: newUserId,
        summary: `Created ${role} account ${email}`,
      });
    });

    res.json({
      id: newUserId,
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

    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super administrators can grant super admin' });
    }

    // Refuse any change that would leave the system with no active super admin.
    // The count itself runs inside the transaction below, so two concurrent
    // demotions cannot both pass it.
    const isDemotion = role !== undefined && role !== 'super_admin' && user.role === 'super_admin';
    const isDeactivation = is_active === false && user.role === 'super_admin';

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
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    // Authorization reads the role out of the JWT, so a session minted before
    // this change carries the old one — a promoted collector keeps getting 403,
    // and a demoted admin keeps their powers, until the token expires (7 days on
    // the phone). Bumping the version ends those sessions now; the next sign-in
    // mints a token carrying the new role. Same reasoning for deactivation,
    // which otherwise leaves a disabled account working until expiry.
    // Coerced, because is_active arrives as a JSON boolean but is stored as
    // 1/0 on SQLite — a raw !== would bump on every no-op activation there.
    const revokesSessions =
      (role !== undefined && role !== user.role) ||
      (is_active !== undefined && !!is_active !== !!user.is_active);

    if (revokesSessions) {
      updates.push(`token_version = COALESCE(token_version, 0) + 1`);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    const changes = diffFields(user, req.body, USER_FIELDS);

    await db.withTransaction(async (tx) => {
      if (isDemotion || isDeactivation) {
        // FOR UPDATE, and counted in JS because an aggregate cannot carry it.
        // Locking the rows serialises two concurrent demotions, so they cannot
        // both read "there are still two of us" and both proceed.
        const supers = await tx.all(
          "SELECT id FROM users WHERE role = 'super_admin' AND is_active = true FOR UPDATE"
        );
        if (supers.length <= 1) {
          const err = new Error('Cannot remove the last super admin. Promote another account first.');
          err.conflict = true;
          throw err;
        }
      }

      await tx.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.USER_UPDATE,
        entityType: 'user',
        entityId: parseInt(id, 10),
        summary: `Updated account ${user.email}`,
        changes,
      });
    });

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    if (err.conflict) {
      return res.status(409).json({ error: err.message });
    }
    console.error('User update error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/auth/change-password — any authenticated user, own account only.
app.post('/api/auth/change-password', verifyJWT, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.password_hash || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, 10);

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [hash, user.id]
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.PASSWORD_CHANGE,
        entityType: 'user',
        entityId: user.id,
        summary: 'Changed their own password; other sessions signed out',
      });
    });

    // The bump above invalidated the token that authorised this request, so the
    // caller needs the replacement or they are signed out on success.
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: (user.token_version ?? 0) + 1 },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ message: 'Password changed successfully', token });
  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PUT /api/auth/users/:id/password — super administrators only.
// Signs the target out of every device, and is the recovery path when one super
// administrator is locked out: the other resets it without database access.
app.put('/api/auth/users/:id/password', verifyJWT, checkRole(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await db.get('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hash = bcrypt.hashSync(new_password, 10);

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
           failed_login_attempts = 0, locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [hash, id]
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.PASSWORD_CHANGE,
        entityType: 'user',
        entityId: parseInt(id, 10),
        summary: `Reset the password for ${user.email}; their sessions were signed out`,
      });
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Password reset error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/auth/users/:id
app.delete('/api/auth/users/:id', verifyJWT, checkRole(['super_admin']), async (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const target = await db.get('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'super_admin') {
      return res.status(409).json({
        error: 'Cannot delete a super admin. Demote the account first, which is itself refused if it is the last one.',
      });
    }

    const result = await db.run('DELETE FROM users WHERE id = $1', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = app;
