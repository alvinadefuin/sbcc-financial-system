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
    tithes_offerings,
    pbcm_share,
    operating_funds,
    mission_funds,
    special_funds,
  } = req.body;

  // Validation
  if (!date || !particular || !total_amount) {
    return res
      .status(400)
      .json({ error: "Date, particular, and total_amount are required" });
  }

  const query = `
    INSERT INTO collections (
      date, particular, control_number, payment_method, total_amount,
      tithes_offerings, pbcm_share, operating_funds, mission_funds, special_funds,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      control_number,
      payment_method || "Cash",
      total_amount,
      tithes_offerings || 0,
      pbcm_share || 0,
      operating_funds || 0,
      mission_funds || 0,
      special_funds || 0,
      req.user.email,
    ],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
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
    tithes_offerings,
    pbcm_share,
    operating_funds,
    mission_funds,
    special_funds,
  } = req.body;

  const query = `
    UPDATE collections SET
      date = ?, particular = ?, control_number = ?, payment_method = ?, total_amount = ?,
      tithes_offerings = ?, pbcm_share = ?, operating_funds = ?, mission_funds = ?, special_funds = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  req.db.run(
    query,
    [
      date,
      particular,
      control_number,
      payment_method,
      total_amount,
      tithes_offerings || 0,
      pbcm_share || 0,
      operating_funds || 0,
      mission_funds || 0,
      special_funds || 0,
      id,
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json({ message: "Collection updated successfully" });
    }
  );
});

// Delete collection
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  req.db.run("DELETE FROM collections WHERE id = ?", [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }
    res.json({ message: "Collection deleted successfully" });
  });
});

module.exports = router;
