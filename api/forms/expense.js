const db = require('../_lib/database');
const { cors } = require('../_lib/auth');

module.exports = cors(async (req, res) => {
  if (req.method === 'GET') {
    // Debug endpoint - return last form data info
    return res.json({ message: 'Expense form endpoint active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  console.log('Expense form raw body:', JSON.stringify(req.body, null, 2));

  const {
    submitter_email, date, description,
    // Legacy fields
    operational_fund, pastoral_workers_support, gap_churches_assistance_program,
    honorarium, conference_seminar_retreat_assembly, fellowship_events,
    anniversary_christmas_events, supplies, utilities, vehicle_maintenance,
    ltg_registration, transportation_gas, building_maintenance,
    abccop_national, cbcc_share, associate_share, abccop_community_day,
    total_amount,
    // New Google Form fields
    pbcm_share_pdot, pastoral_team,
    operational_fund_1, operational_fund_1_amount,
    operational_fund_2, operational_fund_2_amount,
    operational_fund_3, operational_fund_3_amount,
  } = req.body;

  // Extract Google Form fields (try multiple possible field name formats)
  const emailAddress = req.body['Email Address'] || req.body['email'] || submitter_email;
  const formDate = req.body['Date'] || req.body['date'] || date;

  const pbcmSharePdot = req.body['PBCM Share/PDOT'] || req.body['pbcm_share_pdot'] || pbcm_share_pdot;
  const pastoralTeam = req.body['Pastoral Team'] || req.body['pastoral_team'] || pastoral_team;
  const operationalFund1 = req.body['1. Operational Fund'] || req.body['operational_fund_1'] || operational_fund_1;
  const operationalFund1Amount = req.body['1. Amount'] || req.body['1_Amount'] || req.body['operational_fund_1_amount'] || operational_fund_1_amount;
  const operationalFund2 = req.body['2. Operational Fund'] || req.body['operational_fund_2'] || operational_fund_2;
  const operationalFund2Amount = req.body['2. Amount'] || req.body['2_Amount'] || req.body['operational_fund_2_amount'] || operational_fund_2_amount;
  const operationalFund3 = req.body['3. Operational Fund'] || req.body['operational_fund_3'] || operational_fund_3;
  const operationalFund3Amount = req.body['3. Amount'] || req.body['3_Amount'] || req.body['operational_fund_3_amount'] || operational_fund_3_amount;

  const finalEmail = emailAddress || submitter_email;
  const finalDate = formDate || date;

  if (!finalEmail || !finalDate) {
    return res.status(400).json({ error: 'Submitter email and date are required' });
  }

  try {
    const user = await db.get(
      'SELECT id, email, name, role, is_active FROM users WHERE email = $1',
      [finalEmail]
    );

    if (!user || !user.is_active || user.role !== 'user') {
      return res.status(403).json({ error: 'User not authorized to submit forms' });
    }

    let calculatedTotal = total_amount;
    if (!total_amount || total_amount === 0) {
      if (pbcmSharePdot || pastoralTeam || operationalFund1Amount || operationalFund2Amount || operationalFund3Amount) {
        calculatedTotal =
          (parseFloat(pbcmSharePdot) || 0) +
          (parseFloat(pastoralTeam) || 0) +
          (parseFloat(operationalFund1Amount) || 0) +
          (parseFloat(operationalFund2Amount) || 0) +
          (parseFloat(operationalFund3Amount) || 0);
      } else {
        calculatedTotal =
          (parseFloat(operational_fund) || 0) +
          (parseFloat(pastoral_workers_support) || 0) +
          (parseFloat(gap_churches_assistance_program) || 0) +
          (parseFloat(honorarium) || 0) +
          (parseFloat(conference_seminar_retreat_assembly) || 0) +
          (parseFloat(fellowship_events) || 0) +
          (parseFloat(anniversary_christmas_events) || 0) +
          (parseFloat(supplies) || 0) +
          (parseFloat(utilities) || 0) +
          (parseFloat(vehicle_maintenance) || 0) +
          (parseFloat(ltg_registration) || 0) +
          (parseFloat(transportation_gas) || 0) +
          (parseFloat(building_maintenance) || 0) +
          (parseFloat(abccop_national) || 0) +
          (parseFloat(cbcc_share) || 0) +
          (parseFloat(associate_share) || 0) +
          (parseFloat(abccop_community_day) || 0);
      }
    }

    // Check for duplicate submission
    const duplicate = await db.get(
      `SELECT id, total_amount FROM expenses
      WHERE created_by = $1 AND date = $2
      AND ABS(total_amount - $3) < 0.01
      AND created_at > NOW() - INTERVAL '2 minutes'
      ORDER BY created_at DESC LIMIT 1`,
      [user.email, finalDate, calculatedTotal]
    );

    if (duplicate) {
      return res.json({
        success: true,
        message: 'Expense already recorded (duplicate prevention)',
        record_id: duplicate.id,
        total_amount: duplicate.total_amount,
      });
    }

    const expenseDescription = description || `Form submission by ${user.name}`;

    // Helper to map operational fund category to amount
    function mapOpFund(category) {
      return (operationalFund1 === category ? parseFloat(operationalFund1Amount) : 0) ||
        (operationalFund2 === category ? parseFloat(operationalFund2Amount) : 0) ||
        (operationalFund3 === category ? parseFloat(operationalFund3Amount) : 0);
    }

    const result = await db.run(
      `INSERT INTO expenses (
        date, particular, category, total_amount,
        pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
        conference_seminar, fellowship_events, anniversary_christmas,
        supplies, utilities, vehicle_maintenance, lto_registration,
        transportation_gas, building_maintenance, abccop_national,
        cbcc_share, kabalikat_share, abccop_community,
        created_by, submitted_via
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        finalDate,
        expenseDescription,
        'google_form_submission',
        calculatedTotal,
        parseFloat(pbcmSharePdot) || 0,
        parseFloat(pastoralTeam) || parseFloat(pastoral_workers_support) || 0,
        mapOpFund('CAP-Churches Assistance Program') || parseFloat(gap_churches_assistance_program) || 0,
        mapOpFund('Honorarium') || parseFloat(honorarium) || 0,
        mapOpFund('Conference/Seminar/Retreat/Assembly') || parseFloat(conference_seminar_retreat_assembly) || 0,
        mapOpFund('Fellowship Events') || parseFloat(fellowship_events) || 0,
        mapOpFund('Anniversary/Christmas Events') || parseFloat(anniversary_christmas_events) || 0,
        mapOpFund('Supplies') || parseFloat(supplies) || 0,
        mapOpFund('Utilities') || parseFloat(utilities) || 0,
        mapOpFund('Vehicle Maintenance') || parseFloat(vehicle_maintenance) || 0,
        mapOpFund('LTO Registration') || parseFloat(ltg_registration) || 0,
        mapOpFund('Transportation & Gas') || parseFloat(transportation_gas) || 0,
        mapOpFund('Building Maintenance') || parseFloat(building_maintenance) || 0,
        mapOpFund('ABCCOP National') || parseFloat(abccop_national) || 0,
        mapOpFund('CBCC Share') || parseFloat(cbcc_share) || 0,
        mapOpFund('Kabalikat Share') || parseFloat(associate_share) || 0,
        mapOpFund('ABCCOP Community Day') || parseFloat(abccop_community_day) || 0,
        user.email,
        'google_form',
      ]
    );

    res.json({
      success: true,
      message: 'Expense record saved successfully',
      record_id: result.lastID,
      total_amount: calculatedTotal,
    });
  } catch (err) {
    console.error('Error inserting expense:', err);
    res.status(500).json({ error: 'Failed to save expense record' });
  }
});
