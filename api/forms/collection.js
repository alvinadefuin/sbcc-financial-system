const db = require('../_lib/database');
const { cors } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const {
    submitter_email, date, description,
    general_tithes_offering, sunday_school, young_people,
    sisterhood_san_juan, sisterhood_labuin, brotherhood,
    bank_interest, total_amount,
  } = req.body;

  if (!submitter_email || !date) {
    return res.status(400).json({ error: 'Submitter email and date are required' });
  }

  try {
    const user = await db.get(
      'SELECT id, email, name, role, is_active FROM users WHERE email = $1',
      [submitter_email]
    );

    if (!user || !user.is_active || user.role !== 'user') {
      return res.status(403).json({ error: 'User not authorized to submit forms' });
    }

    let calculatedTotal = total_amount;
    if (!total_amount || total_amount === 0) {
      calculatedTotal =
        (parseFloat(general_tithes_offering) || 0) +
        (parseFloat(sunday_school) || 0) +
        (parseFloat(young_people) || 0) +
        (parseFloat(sisterhood_san_juan) || 0) +
        (parseFloat(sisterhood_labuin) || 0) +
        (parseFloat(brotherhood) || 0) +
        (parseFloat(bank_interest) || 0);
    }

    const now = new Date();
    const controlNumber = `FORM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    const result = await db.run(
      `INSERT INTO collections (
        date, control_number, particular, total_amount,
        general_tithes_offering, sunday_school, youth,
        sisterhood_san_juan, sisterhood_labuin, brotherhood,
        bank_interest, created_by, submitted_via
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        date, controlNumber,
        description || `Form submission by ${user.name}`,
        calculatedTotal,
        parseFloat(general_tithes_offering) || 0,
        parseFloat(sunday_school) || 0,
        parseFloat(young_people) || 0,
        parseFloat(sisterhood_san_juan) || 0,
        parseFloat(sisterhood_labuin) || 0,
        parseFloat(brotherhood) || 0,
        parseFloat(bank_interest) || 0,
        user.email, 'google_form',
      ]
    );

    res.json({
      success: true,
      message: 'Collection record saved successfully',
      record_id: result.lastID,
      control_number: controlNumber,
      total_amount: calculatedTotal,
    });
  } catch (err) {
    console.error('Error inserting collection:', err);
    res.status(500).json({ error: 'Failed to save collection record' });
  }
});
