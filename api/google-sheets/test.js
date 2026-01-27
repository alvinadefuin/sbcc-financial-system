const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  res.status(503).json({
    success: false,
    message: 'Google Sheets test not available in serverless environment.',
  });
}));
