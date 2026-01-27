const { cors } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  res.json({
    lastSubmittedData: null,
    message: 'Debug endpoint - serverless functions do not persist in-memory state between invocations',
  });
});
