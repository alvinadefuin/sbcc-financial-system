const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

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
  const {
    submitter_email,
    date,
    description,
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

      // Insert expense record
      req.db.run(
        `INSERT INTO expenses (
          date, particular, category, total_amount,
          pastoral_worker_support, cap_assistance, honorarium,
          conference_seminar, fellowship_events, anniversary_christmas,
          supplies, utilities, vehicle_maintenance, lto_registration,
          transportation_gas, building_maintenance, abccop_national,
          cbcc_share, kabalikat_share, abccop_community,
          created_by, submitted_via
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          description || `Form submission by ${user.name}`,
          'google_form_submission',
          calculatedTotal,
          parseFloat(pastoral_workers_support) || 0,
          parseFloat(gap_churches_assistance_program) || 0,
          parseFloat(honorarium) || 0,
          parseFloat(conference_seminar_retreat_assembly) || 0,
          parseFloat(fellowship_events) || 0,
          parseFloat(anniversary_christmas_events) || 0,
          parseFloat(supplies) || 0,
          parseFloat(utilities) || 0,
          parseFloat(vehicle_maintenance) || 0,
          parseFloat(ltg_registration) || 0,
          parseFloat(transportation_gas) || 0,
          parseFloat(building_maintenance) || 0,
          parseFloat(abccop_national) || 0,
          parseFloat(cbcc_share) || 0,
          parseFloat(associate_share) || 0,
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
    }
  );
});

module.exports = router;