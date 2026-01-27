const { cors, authenticateToken } = require('../_lib/auth');

module.exports = cors(authenticateToken(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  // Google Sheets service requires googleapis and service account credentials
  // which are not available in the serverless environment by default.
  // This endpoint returns a not-available status.
  res.status(503).json({
    success: false,
    message: 'Google Sheets export is not available in the serverless environment. Use the n8n automation workflow instead.',
  });
}));
