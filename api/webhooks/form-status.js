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

  const { formType, recordId, status, errorMessage, submitterEmail } = req.body;

  console.log(`[n8n] Form ${formType} - Record ${recordId} - Status: ${status}`);

  if (status === 'failed' && errorMessage) {
    console.error(`[n8n] Error: ${errorMessage} - User: ${submitterEmail}`);
  }

  res.json({
    success: true,
    message: 'Status received',
    timestamp: new Date().toISOString(),
  });
});
