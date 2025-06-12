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

  // Validation
  if (!date || !particular || !total_amount) {
    return res
      .status(400)
      .json({ error: "Date, particular, and total_amount are required" });
  }

  const query = `
    INSERT INTO expenses (
      date, particular, forms_number, cheque_number, total_amount,
      workers_share, fellowship_expense, supplies, utilities, building_maintenance,
      benevolence_donations, honorarium, vehicle_maintenance, gasoline_transport,
      pbcm_share, mission_evangelism, admin_expense, worship_music, discipleship, pastoral_care,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  } = req.body;

  const query = `
    UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?, total_amount = ?,
      workers_share = ?, fellowship_expense = ?, supplies = ?, utilities = ?, building_maintenance = ?,
      updated_at = CURRENT_TIMESTAMP
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
      id,
    ],
    function (err) {
      if (err) {
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
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.json({ message: "Expense deleted successfully" });
  });
});

module.exports = router;
