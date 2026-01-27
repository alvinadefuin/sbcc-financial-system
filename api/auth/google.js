const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../_lib/database');
const { cors, JWT_SECRET } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method === 'GET') {
    // GET /api/auth/google -> return config
    // This handles /api/auth/google/config via rewrite or direct call
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const configured = !!(clientId && process.env.GOOGLE_CLIENT_SECRET);
    return res.json({ clientId, configured });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

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
