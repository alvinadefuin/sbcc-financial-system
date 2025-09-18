const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

// In-memory cache for recent submissions to prevent rapid duplicates
const recentSubmissions = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > CACHE_DURATION) {
      recentSubmissions.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

// Validate user eligibility for form submissions
router.get("/validate-user/:email", (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  req.db.get(
    "SELECT id, email, name, role, is_active FROM users WHERE email = ?",
    [email],
    (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (!user) {
        return res.status(404).json({ 
          error: "User not found",
          canSubmit: false 
        });
      }

      if (!user.is_active) {
        return res.status(403).json({ 
          error: "Account is disabled",
          canSubmit: false 
        });
      }

      // Only allow users with "member" role to submit forms
      if (user.role !== "user") {
        return res.status(403).json({ 
          error: "Only members can submit forms",
          canSubmit: false 
        });
      }

      res.json({
        canSubmit: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    }
  );
});

// Quick user creation endpoint for testing
router.post("/create-test-user", (req, res) => {
  const { email, name } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ 
      error: "Email and name are required" 
    });
  }
  
  // Create a default password hash
  const defaultPassword = bcrypt.hashSync("member123", 10);
  
  req.db.run(
    `INSERT OR IGNORE INTO users (email, name, role, password_hash, is_active, created_by)
     VALUES (?, ?, 'user', ?, 1, 'system')`,
    [email, name, defaultPassword],
    function(err) {
      if (err) {
        console.error("Error creating user:", err);
        return res.status(500).json({ error: "Failed to create user" });
      }
      
      if (this.changes === 0) {
        return res.json({ 
          message: "User already exists",
          email: email
        });
      }
      
      res.json({
        success: true,
        message: "Test user created successfully",
        email: email,
        name: name,
        password: "member123",
        user_id: this.lastID
      });
    }
  );
});

// Process collection form submission
router.post("/collection", (req, res) => {
  const {
    submitter_email,
    date,
    description,
    general_tithes_offering,
    sunday_school,
    young_people,
    sisterhood_san_juan,
    sisterhood_labuin,
    brotherhood,
    bank_interest,
    total_amount
  } = req.body;

  // Validate required fields
  if (!submitter_email || !date) {
    return res.status(400).json({
      error: "Submitter email and date are required"
    });
  }

  // First, validate the user
  req.db.get(
    "SELECT id, email, name, role, is_active FROM users WHERE email = ?",
    [submitter_email],
    (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (!user || !user.is_active || user.role !== "user") {
        return res.status(403).json({ 
          error: "User not authorized to submit forms" 
        });
      }

      // Auto-calculate total if not provided
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

      // Generate control number
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const time = String(now.getHours()).padStart(2, '0') + 
                   String(now.getMinutes()).padStart(2, '0');
      const controlNumber = `FORM-${year}${month}${day}-${time}`;

      // Insert collection record
      req.db.run(
        `INSERT INTO collections (
          date, control_number, particular, total_amount,
          general_tithes_offering, sunday_school, youth,
          sisterhood_san_juan, sisterhood_labuin, brotherhood,
          bank_interest, created_by, submitted_via
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          controlNumber,
          description || `Form submission by ${user.name}`,
          calculatedTotal,
          parseFloat(general_tithes_offering) || 0,
          parseFloat(sunday_school) || 0,
          parseFloat(young_people) || 0,
          parseFloat(sisterhood_san_juan) || 0,
          parseFloat(sisterhood_labuin) || 0,
          parseFloat(brotherhood) || 0,
          parseFloat(bank_interest) || 0,
          user.email,
          'google_form'
        ],
        function (err) {
          if (err) {
            console.error("Error inserting collection:", err);
            return res.status(500).json({ 
              error: "Failed to save collection record" 
            });
          }

          res.json({
            success: true,
            message: "Collection record saved successfully",
            record_id: this.lastID,
            control_number: controlNumber,
            total_amount: calculatedTotal
          });
        }
      );
    }
  );
});

// Process expense form submission
router.post("/expense", (req, res) => {
  // Debug: Log and capture the raw request body to see what Google Forms is sending
  console.log("Expense form raw body:", JSON.stringify(req.body, null, 2));
  console.log("Available request body keys:", Object.keys(req.body));
  lastExpenseFormData = { ...req.body, timestamp: new Date().toISOString() };
  
  const {
    submitter_email,
    date,
    description,
    // Legacy fields (for backward compatibility)
    operational_fund,
    pastoral_workers_support,
    gap_churches_assistance_program,
    honorarium,
    conference_seminar_retreat_assembly,
    fellowship_events,
    anniversary_christmas_events,
    supplies,
    utilities,
    vehicle_maintenance,
    ltg_registration,
    transportation_gas,
    building_maintenance,
    abccop_national,
    cbcc_share,
    associate_share,
    abccop_community_day,
    total_amount,
    // New Google Form fields (underscore format)
    pbcm_share_pdot,
    pastoral_team,
    operational_fund_1,
    operational_fund_1_amount,
    operational_fund_2,
    operational_fund_2_amount,
    operational_fund_3,
    operational_fund_3_amount,
  } = req.body;

  // Extract Google Form fields (try multiple possible field name formats)
  const emailAddress = req.body["Email Address"] || req.body["email"] || submitter_email;
  const formDate = req.body["Date"] || req.body["date"] || date;
  
  // Try different field name patterns for amounts
  const pbcmSharePdot = 
    req.body["PBCM Share/PDOT"] || 
    req.body["pbcm_share_pdot"] || 
    req.body["entry.PBCM_Share_PDOT"] || 
    req.body["PBCM_Share_PDOT"] ||
    pbcm_share_pdot;
    
  const pastoralTeam = 
    req.body["Pastoral Team"] || 
    req.body["pastoral_team"] || 
    req.body["entry.Pastoral_Team"] ||
    req.body["Pastoral_Team"] ||
    pastoral_team;
    
  const operationalFund1 = req.body["1. Operational Fund"] || req.body["operational_fund_1"] || operational_fund_1;
  const operationalFund1Amount = 
    req.body["1. Amount"] || 
    req.body["1_Amount"] ||
    req.body["entry.1_Amount"] ||
    req.body["operational_fund_1_amount"] || 
    operational_fund_1_amount;
    
  const operationalFund2 = req.body["2. Operational Fund"] || req.body["operational_fund_2"] || operational_fund_2;
  const operationalFund2Amount = 
    req.body["2. Amount"] || 
    req.body["2_Amount"] ||
    req.body["entry.2_Amount"] ||
    req.body["operational_fund_2_amount"] || 
    operational_fund_2_amount;
    
  const operationalFund3 = req.body["3. Operational Fund"] || req.body["operational_fund_3"] || operational_fund_3;
  const operationalFund3Amount = 
    req.body["3. Amount"] || 
    req.body["3_Amount"] ||
    req.body["entry.3_Amount"] ||
    req.body["operational_fund_3_amount"] || 
    operational_fund_3_amount;

  // Validate required fields (use Google Form fields if available)
  const finalEmail = emailAddress || submitter_email;
  const finalDate = formDate || date;
  
  if (!finalEmail || !finalDate) {
    return res.status(400).json({ 
      error: "Submitter email and date are required" 
    });
  }

  // First, validate the user
  req.db.get(
    "SELECT id, email, name, role, is_active FROM users WHERE email = ?",
    [finalEmail],
    (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (!user || !user.is_active || user.role !== "user") {
        return res.status(403).json({ 
          error: "User not authorized to submit forms" 
        });
      }

      // Auto-calculate total if not provided
      let calculatedTotal = total_amount;
      if (!total_amount || total_amount === 0) {
        // Check if using new Google Form structure (use extracted Google Form field names)
        if (pbcmSharePdot || pastoralTeam || operationalFund1Amount || operationalFund2Amount || operationalFund3Amount) {
          // New Google Form calculation
          calculatedTotal = 
            (parseFloat(pbcmSharePdot) || 0) +
            (parseFloat(pastoralTeam) || 0) +
            (parseFloat(operationalFund1Amount) || 0) +
            (parseFloat(operationalFund2Amount) || 0) +
            (parseFloat(operationalFund3Amount) || 0);
        } else {
          // Legacy calculation
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

      // Check for duplicate submission (same user, same date, similar amount within 2 minutes)
      // This helps prevent Google Forms double-submission issues
      const checkDuplicateSql = `
        SELECT id, total_amount, created_at, particular
        FROM expenses
        WHERE created_by = ?
        AND date = ?
        AND (
          ABS(total_amount - ?) < 0.01
          OR particular = ?
        )
        AND created_at > NOW() - INTERVAL '2 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      // Check in-memory cache first for rapid duplicate prevention
      const submissionKey = `${user.email}_${finalDate}_${calculatedTotal}`;
      const now = Date.now();

      if (recentSubmissions.has(submissionKey)) {
        console.log('Rapid duplicate submission detected from in-memory cache');
        // Find the recent record
        req.db.get(
          "SELECT id, total_amount FROM expenses WHERE created_by = ? AND date = ? AND total_amount = ? ORDER BY created_at DESC LIMIT 1",
          [user.email, finalDate, calculatedTotal],
          (err, record) => {
            if (record) {
              return res.json({
                success: true,
                message: "Expense already recorded (rapid duplicate prevention)",
                record_id: record.id,
                total_amount: record.total_amount
              });
            } else {
              // If no record found, continue with normal process
              processExpenseSubmission();
            }
          }
        );
        return;
      }

      // Add to cache
      recentSubmissions.set(submissionKey, now);

      // Build the expected description first for duplicate checking
      let expectedDescription = description;
      if (!expectedDescription) {
        if (pbcmSharePdot || pastoralTeam || operationalFund1Amount) {
          // New Google Form structure
          let parts = [`Form submission by ${user.name}`];
          if (pbcmSharePdot > 0) parts.push(`PBCM Share/PDOT: ₱${pbcmSharePdot}`);
          if (pastoralTeam > 0) parts.push(`Pastoral Team: ₱${pastoralTeam}`);
          if (operationalFund1Amount > 0) parts.push(`${operationalFund1 || 'Operational Fund'}: ₱${operationalFund1Amount}`);
          if (operationalFund2Amount > 0) parts.push(`${operationalFund2 || 'Operational Fund'}: ₱${operationalFund2Amount}`);
          if (operationalFund3Amount > 0) parts.push(`${operationalFund3 || 'Operational Fund'}: ₱${operationalFund3Amount}`);
          expectedDescription = parts.join(', ');
        } else {
          expectedDescription = `Form submission by ${user.name}`;
        }
      }

      processExpenseSubmission();

      function processExpenseSubmission() {

      req.db.get(checkDuplicateSql, [user.email, finalDate, calculatedTotal, expectedDescription], (dupErr, duplicate) => {
        if (dupErr) {
          console.error("Error checking for duplicates:", dupErr);
          // Continue with insertion if duplicate check fails
        } else if (duplicate) {
          console.log('Duplicate expense submission detected, returning existing record');
          return res.json({
            success: true,
            message: "Expense already recorded (duplicate prevention)",
            record_id: duplicate.id,
            total_amount: duplicate.total_amount
          });
        }

        // Use the expected description we built for duplicate checking
        const expenseDescription = expectedDescription;

      // Insert expense record
      req.db.run(
        `INSERT INTO expenses (
          date, particular, category, total_amount,
          pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
          conference_seminar, fellowship_events, anniversary_christmas,
          supplies, utilities, vehicle_maintenance, lto_registration,
          transportation_gas, building_maintenance, abccop_national,
          cbcc_share, kabalikat_share, abccop_community,
          created_by, submitted_via
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalDate,
          expenseDescription,
          'google_form_submission',
          calculatedTotal,
          // New: Map PBCM Share/PDOT to pbcm_share_expense column
          parseFloat(pbcmSharePdot) || 0,
          // Map Pastoral Team to pastoral_worker_support
          parseFloat(pastoralTeam) || parseFloat(pastoral_workers_support) || 0,
          // Map operational funds to appropriate columns based on category
          // Map CAP-Churches Assistance Program from operational fund if that category was selected
          (operationalFund1 === 'CAP-Churches Assistance Program' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'CAP-Churches Assistance Program' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'CAP-Churches Assistance Program' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(gap_churches_assistance_program) || 0,
          // Map Honorarium from operational fund if that category was selected
          (operationalFund1 === 'Honorarium' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Honorarium' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Honorarium' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(honorarium) || 0,
          // Map Conference/Seminar from operational fund if that category was selected
          (operationalFund1 === 'Conference/Seminar/Retreat/Assembly' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Conference/Seminar/Retreat/Assembly' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Conference/Seminar/Retreat/Assembly' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(conference_seminar_retreat_assembly) || 0,
          // Map Fellowship Events from operational fund if that category was selected
          (operationalFund1 === 'Fellowship Events' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Fellowship Events' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Fellowship Events' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(fellowship_events) || 0,
          // Map Anniversary/Christmas Events from operational fund if that category was selected
          (operationalFund1 === 'Anniversary/Christmas Events' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Anniversary/Christmas Events' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Anniversary/Christmas Events' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(anniversary_christmas_events) || 0,
          // Map Supplies from operational fund if that category was selected
          (operationalFund1 === 'Supplies' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Supplies' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Supplies' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(supplies) || 0,
          // Map Utilities from operational fund if that category was selected
          (operationalFund1 === 'Utilities' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Utilities' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Utilities' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(utilities) || 0,
          // Map Vehicle Maintenance from operational fund if that category was selected
          (operationalFund1 === 'Vehicle Maintenance' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Vehicle Maintenance' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Vehicle Maintenance' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(vehicle_maintenance) || 0,
          // Map LTO Registration from operational fund if that category was selected
          (operationalFund1 === 'LTO Registration' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'LTO Registration' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'LTO Registration' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(ltg_registration) || 0,
          // Map Transportation & Gas from operational fund if that category was selected
          (operationalFund1 === 'Transportation & Gas' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Transportation & Gas' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Transportation & Gas' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(transportation_gas) || 0,
          // Map Building Maintenance from operational fund if that category was selected
          (operationalFund1 === 'Building Maintenance' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Building Maintenance' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Building Maintenance' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(building_maintenance) || 0,
          // Map ABCCOP National from operational fund if that category was selected
          (operationalFund1 === 'ABCCOP National' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'ABCCOP National' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'ABCCOP National' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(abccop_national) || 0,
          // Map CBCC Share from operational fund if that category was selected
          (operationalFund1 === 'CBCC Share' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'CBCC Share' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'CBCC Share' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(cbcc_share) || 0,
          // Map Kabalikat Share from operational fund if that category was selected
          (operationalFund1 === 'Kabalikat Share' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'Kabalikat Share' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'Kabalikat Share' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(associate_share) || 0,
          // Map ABCCOP Community Day from operational fund if that category was selected
          (operationalFund1 === 'ABCCOP Community Day' ? parseFloat(operationalFund1Amount) : 0) ||
          (operationalFund2 === 'ABCCOP Community Day' ? parseFloat(operationalFund2Amount) : 0) ||
          (operationalFund3 === 'ABCCOP Community Day' ? parseFloat(operationalFund3Amount) : 0) ||
          parseFloat(abccop_community_day) || 0,
          user.email,
          'google_form'
        ],
        function (err) {
          if (err) {
            console.error("Error inserting expense:", err);
            return res.status(500).json({ 
              error: "Failed to save expense record" 
            });
          }

          res.json({
            success: true,
            message: "Expense record saved successfully",
            record_id: this.lastID,
            total_amount: calculatedTotal
          });
        }
      );
      }); // Close duplicate check callback
      } // Close processExpenseSubmission function
    }  // Close user validation callback
  );   // Close req.db.get for user validation
});

// Debug endpoint to capture last form submission data
let lastExpenseFormData = null;

// Debug endpoint to view last submitted form data
router.get("/debug/last-expense-form", (req, res) => {
  res.json({
    lastSubmittedData: lastExpenseFormData,
    message: "Last expense form submission data for debugging"
  });
});

// Quick endpoint to view recent form submissions
router.get("/recent-submissions", (req, res) => {
  const limit = req.query.limit || 10;
  
  // Get recent collections
  req.db.all(
    "SELECT 'collection' as type, date, particular, total_amount, created_by, submitted_via FROM collections WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT ?",
    [limit],
    (err, collections) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }
      
      // Get recent expenses
      req.db.all(
        "SELECT 'expense' as type, date, particular, total_amount, created_by, submitted_via FROM expenses WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT ?",
        [limit],
        (expenseErr, expenses) => {
          if (expenseErr) {
            return res.status(500).json({ error: "Database error" });
          }
          
          const allSubmissions = [...collections, ...expenses]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
            
          res.json({
            success: true,
            message: `Recent ${allSubmissions.length} form submissions`,
            submissions: allSubmissions
          });
        }
      );
    }
  );
});

module.exports = router;