const { cors } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SBCC Financial API - Webhooks',
  });
});
