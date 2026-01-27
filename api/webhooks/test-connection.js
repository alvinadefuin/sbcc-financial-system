const { cors } = require('../_lib/auth');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-this-secret';

module.exports = cors(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook request' });
  }

  res.json({
    success: true,
    message: 'n8n webhook connection successful!',
    timestamp: new Date().toISOString(),
    receivedData: req.body,
  });
});
