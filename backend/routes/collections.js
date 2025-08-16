const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Get all collections
router.get("/", authenticateToken, (req, res) => {
  const { month, year } = req.query;
  let query = "SELECT * FROM collections";
  let params = [];

  if (month && year) {
    query += ' WHERE strftime("%Y-%m", date) = ?';
    params.push(`${year}-${month.padStart(2, "0")}`);
  }

  query += " ORDER BY date DESC";

  req.db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add new collection
router.post("/", authenticateToken, (req, res) => {
  const {
    date,
    particular,
    control_number,
    payment_method,
    total_amount,
    general_tithes_offering,
    bank_interest,
    sisterhood_san_juan,
    sisterhood_labuin,
    brotherhood,
    youth,
    couples,
    sunday_school,
    special_purpose_pledge,
  } = req.body;

  // Validation
  if (!date || !particular || !total_amount) {
    return res
      .status(400)
      .json({ error: "Date, particular, and total_amount are required" });
  }

  // Calculate fund allocations based on general tithes & offering
  const generalTithesAmount = parseFloat(general_tithes_offering) || 0;
  const pbcmShare = generalTithesAmount * 0.10;
  const pastoralTeamShare = generalTithesAmount * 0.10;
  const operationalFundShare = generalTithesAmount * 0.80;

  const query = `
    INSERT INTO collections (
      date, particular, control_number, payment_method, total_amount,
      general_tithes_offering, bank_interest,
      sisterhood_san_juan, sisterhood_labuin, brotherhood, youth, couples, sunday_school, special_purpose_pledge,
      pbcm_share, pastoral_team_share, operational_fund_share,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      control_number,
      payment_method || "Cash",
      total_amount,
      general_tithes_offering || 0,
      bank_interest || 0,
      sisterhood_san_juan || 0,
      sisterhood_labuin || 0,
      brotherhood || 0,
      youth || 0,
      couples || 0,
      sunday_school || 0,
      special_purpose_pledge || 0,
      pbcmShare,
      pastoralTeamShare,
      operationalFundShare,
      req.user.email,
    ],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      
      // Create fund allocation record
      const allocationQuery = `
        INSERT INTO fund_allocation (
          collection_id, date, general_tithes_amount, 
          pbcm_allocation, pastoral_team_allocation, operational_allocation
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      req.db.run(allocationQuery, [
        this.lastID, date, generalTithesAmount, 
        pbcmShare, pastoralTeamShare, operationalFundShare
      ]);
      
      res.json({ id: this.lastID, message: "Collection added successfully" });
    }
  );
});

// Get collection by ID
router.get("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  req.db.get("SELECT * FROM collections WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Collection not found" });
    }
    res.json(row);
  });
});

// Update collection
router.put("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const {
    date,
    particular,
    control_number,
    payment_method,
    total_amount,
    general_tithes_offering,
    bank_interest,
    sisterhood_san_juan,
    sisterhood_labuin,
    brotherhood,
    youth,
    couples,
    sunday_school,
    special_purpose_pledge,
  } = req.body;

  // Add validation
  if (!date || !particular || !total_amount) {
    return res.status(400).json({
      error: "Date, particular, and total_amount are required",
    });
  }

  if (total_amount <= 0) {
    return res.status(400).json({
      error: "Total amount must be greater than 0",
    });
  }

  // Recalculate fund allocations
  const generalTithesAmount = parseFloat(general_tithes_offering) || 0;
  const pbcmShare = generalTithesAmount * 0.10;
  const pastoralTeamShare = generalTithesAmount * 0.10;
  const operationalFundShare = generalTithesAmount * 0.80;

  const query = `
    UPDATE collections SET
      date = ?, particular = ?, control_number = ?, payment_method = ?, total_amount = ?,
      general_tithes_offering = ?, bank_interest = ?,
      sisterhood_san_juan = ?, sisterhood_labuin = ?, brotherhood = ?, youth = ?, couples = ?, 
      sunday_school = ?, special_purpose_pledge = ?,
      pbcm_share = ?, pastoral_team_share = ?, operational_fund_share = ?
    WHERE id = ?
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      control_number,
      payment_method || "Cash",
      total_amount,
      general_tithes_offering || 0,
      bank_interest || 0,
      sisterhood_san_juan || 0,
      sisterhood_labuin || 0,
      brotherhood || 0,
      youth || 0,
      couples || 0,
      sunday_school || 0,
      special_purpose_pledge || 0,
      pbcmShare,
      pastoralTeamShare,
      operationalFundShare,
      id,
    ],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      // Update fund allocation record
      const allocationQuery = `
        UPDATE fund_allocation SET
          date = ?, general_tithes_amount = ?, 
          pbcm_allocation = ?, pastoral_team_allocation = ?, operational_allocation = ?
        WHERE collection_id = ?
      `;
      
      req.db.run(allocationQuery, [
        date, generalTithesAmount, 
        pbcmShare, pastoralTeamShare, operationalFundShare, id
      ]);
      
      res.json({ message: "Collection updated successfully" });
    }
  );
});

// Delete collection
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  // Delete fund allocation record first
  req.db.run("DELETE FROM fund_allocation WHERE collection_id = ?", [id], (err) => {
    if (err) {
      console.error("Error deleting fund allocation:", err.message);
    }
  });

  req.db.run("DELETE FROM collections WHERE id = ?", [id], function (err) {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }
    res.json({ message: "Collection deleted successfully" });
  });
});

// Get fund allocation summary
router.get("/fund-allocation/summary", authenticateToken, (req, res) => {
  const { month, year } = req.query;
  let whereClause = "";
  let params = [];

  if (month && year) {
    whereClause = ' WHERE strftime("%Y-%m", date) = ?';
    params.push(`${year}-${month.padStart(2, "0")}`);
  }

  const query = `
    SELECT 
      SUM(general_tithes_amount) as total_tithes,
      SUM(pbcm_allocation) as total_pbcm,
      SUM(pastoral_team_allocation) as total_pastoral,
      SUM(operational_allocation) as total_operational
    FROM fund_allocation${whereClause}
  `;

  req.db.get(query, params, (err, row) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(row);
  });
});

// Get detailed collections summary
router.get("/summary/detailed", authenticateToken, (req, res) => {
  const { month, year } = req.query;
  let whereClause = "";
  let params = [];

  if (month && year) {
    whereClause = ' WHERE strftime("%Y-%m", date) = ?';
    params.push(`${year}-${month.padStart(2, "0")}`);
  }

  const query = `
    SELECT 
      SUM(total_amount) as total_collections,
      SUM(general_tithes_offering) as total_general_tithes,
      SUM(bank_interest) as total_bank_interest,
      SUM(sisterhood_san_juan) as total_sisterhood_sj,
      SUM(sisterhood_labuin) as total_sisterhood_labuin,
      SUM(brotherhood) as total_brotherhood,
      SUM(youth) as total_youth,
      SUM(couples) as total_couples,
      SUM(sunday_school) as total_sunday_school,
      SUM(special_purpose_pledge) as total_special_purpose,
      SUM(pbcm_share) as total_pbcm_share,
      SUM(pastoral_team_share) as total_pastoral_share,
      SUM(operational_fund_share) as total_operational_share,
      COUNT(*) as total_records
    FROM collections${whereClause}
  `;

  req.db.get(query, params, (err, row) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(row);
  });
});

module.exports = router;
