const { cors } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const configured = !!(clientId && process.env.GOOGLE_CLIENT_SECRET);

  res.json({ clientId, configured });
});
