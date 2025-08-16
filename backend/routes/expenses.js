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

// Get all expenses
router.get("/", authenticateToken, (req, res) => {
  const { month, year } = req.query;
  let query = "SELECT * FROM expenses";
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

// Add new expense
router.post("/", authenticateToken, (req, res) => {
  const {
    date,
    particular,
    forms_number,
    cheque_number,
    category,
    subcategory,
    total_amount,
    budget_amount,
    percentage_allocation,
    fund_source,
    // Specific expense fields
    pbcm_share_expense,
    pastoral_worker_support,
    cap_assistance,
    honorarium,
    conference_seminar,
    fellowship_events,
    anniversary_christmas,
    supplies,
    utilities,
    vehicle_maintenance,
    lto_registration,
    transportation_gas,
    building_maintenance,
    abccop_national,
    cbcc_share,
    kabalikat_share,
    abccop_community,
  } = req.body;

  // Validation
  if (!date || !particular || !total_amount || !category) {
    return res
      .status(400)
      .json({ error: "Date, particular, total_amount, and category are required" });
  }

  const query = `
    INSERT INTO expenses (
      date, particular, forms_number, cheque_number, category, subcategory,
      total_amount, budget_amount, percentage_allocation, fund_source,
      pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
      conference_seminar, fellowship_events, anniversary_christmas, supplies,
      utilities, vehicle_maintenance, lto_registration, transportation_gas,
      building_maintenance, abccop_national, cbcc_share, kabalikat_share, abccop_community,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      forms_number,
      cheque_number,
      category,
      subcategory,
      total_amount,
      budget_amount || 0,
      percentage_allocation || 0,
      fund_source || 'operational',
      pbcm_share_expense || 0,
      pastoral_worker_support || 0,
      cap_assistance || 0,
      honorarium || 0,
      conference_seminar || 0,
      fellowship_events || 0,
      anniversary_christmas || 0,
      supplies || 0,
      utilities || 0,
      vehicle_maintenance || 0,
      lto_registration || 0,
      transportation_gas || 0,
      building_maintenance || 0,
      abccop_national || 0,
      cbcc_share || 0,
      kabalikat_share || 0,
      abccop_community || 0,
      req.user.email,
    ],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: "Expense added successfully" });
    }
  );
});

// Get expense by ID
router.get("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  req.db.get("SELECT * FROM expenses WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.json(row);
  });
});

// Update expense
router.put("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const {
    date,
    particular,
    forms_number,
    cheque_number,
    total_amount,
    workers_share,
    fellowship_expense,
    supplies,
    utilities,
    building_maintenance,
    benevolence_donations,
    honorarium,
    vehicle_maintenance,
    gasoline_transport,
    pbcm_share,
    mission_evangelism,
    admin_expense,
    worship_music,
    discipleship,
    pastoral_care,
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

  const query = `
    UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?, total_amount = ?,
      workers_share = ?, fellowship_expense = ?, supplies = ?, utilities = ?, building_maintenance = ?,
      benevolence_donations = ?, honorarium = ?, vehicle_maintenance = ?, gasoline_transport = ?,
      pbcm_share = ?, mission_evangelism = ?, admin_expense = ?, worship_music = ?, discipleship = ?, pastoral_care = ?
    WHERE id = ?
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      forms_number,
      cheque_number,
      total_amount,
      workers_share || 0,
      fellowship_expense || 0,
      supplies || 0,
      utilities || 0,
      building_maintenance || 0,
      benevolence_donations || 0,
      honorarium || 0,
      vehicle_maintenance || 0,
      gasoline_transport || 0,
      pbcm_share || 0,
      mission_evangelism || 0,
      admin_expense || 0,
      worship_music || 0,
      discipleship || 0,
      pastoral_care || 0,
      id,
    ],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json({ message: "Expense updated successfully" });
    }
  );
});

// Delete expense
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  req.db.run("DELETE FROM expenses WHERE id = ?", [id], function (err) {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.json({ message: "Expense deleted successfully" });
  });
});

module.exports = router;
