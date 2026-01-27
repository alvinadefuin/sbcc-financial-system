const db = require('../../_lib/database');
const { cors, requireRole } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  return requireRole(['super_admin', 'admin'], async (req, res) => {
    const { tableName } = req.query;

    if (!['collections', 'expenses'].includes(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const webhookUrl = process.env.GOOGLE_FORM_SYNC_WEBHOOK_URL;
    const apiSecret = process.env.GOOGLE_FORM_SYNC_SECRET || 'your-shared-secret-key';

    if (!webhookUrl) {
      return res.status(500).json({
        error: 'Google Form sync webhook URL not configured',
        hint: 'Set GOOGLE_FORM_SYNC_WEBHOOK_URL in environment variables',
      });
    }

    try {
      const fields = await db.all(
        `SELECT * FROM custom_fields
        WHERE table_name = $1 AND is_active = true
        ORDER BY display_order ASC, created_at ASC`,
        [tableName]
      );

      // Dynamic import for fetch (available in Node 18+ on Vercel)
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: apiSecret,
          tableName,
          customFields: fields,
        }),
      });

      const data = await response.json();

      if (data.success) {
        res.json({
          success: true,
          message: `Successfully synced ${fields.length} custom fields to Google Form`,
          details: data.details,
        });
      } else {
        res.status(500).json({
          success: false,
          error: data.error || 'Unknown error from Google Form',
        });
      }
    } catch (err) {
      console.error('Google Form webhook error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to sync with Google Form',
        details: err.message,
      });
    }
  })(req, res);
});
