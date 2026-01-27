const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  res.json({
    success: true,
    configured: false,
    message: 'Google Sheets integration not available in serverless environment. Use n8n automation instead.',
  });
}));
