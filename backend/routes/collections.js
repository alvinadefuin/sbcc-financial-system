const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const {
  enrichRecordsWithCustomFields,
  saveCustomFieldValues,
  getCustomFieldValues
} = require('../utils/customFieldsHelper');

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
  const { month, year, dateFrom, dateTo } = req.query;
  let query = "SELECT * FROM collections";
  let params = [];
  let whereConditions = [];

  // Date range filtering (priority over month/year)
  if (dateFrom && dateTo) {
    whereConditions.push("date BETWEEN ? AND ?");
    params.push(dateFrom, dateTo);
  } else if (month && year) {
    whereConditions.push('strftime("%Y-%m", date) = ?');
    params.push(`${year}-${month.padStart(2, "0")}`);
  }

  if (whereConditions.length > 0) {
    query += " WHERE " + whereConditions.join(" AND ");
  }

  query += " ORDER BY date DESC";

  req.db.all(query, params, async (err, rows) => {
    if (err) {
      console.error("Database error:", err.message);
      return res.status(500).json({ error: err.message });
    }

    // Enrich with custom field values
    try {
      const enriched = await enrichRecordsWithCustomFields(req.db, 'collections', rows);
      res.json(enriched);
    } catch (customFieldErr) {
      console.error("Error fetching custom fields:", customFieldErr);
      // Still return records even if custom fields fail
      res.json(rows);
    }
  });
});

// Add new collection
router.post("/", authenticateToken, async (req, res) => {
  try {
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
      custom_fields,
    } = req.body;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    let calculatedTotal = total_amount;
    if (!total_amount || total_amount === 0) {
      calculatedTotal = (parseFloat(general_tithes_offering) || 0) +
                       (parseFloat(bank_interest) || 0) +
                       (parseFloat(sisterhood_san_juan) || 0) +
                       (parseFloat(sisterhood_labuin) || 0) +
                       (parseFloat(brotherhood) || 0) +
                       (parseFloat(youth) || 0) +
                       (parseFloat(couples) || 0) +
                       (parseFloat(sunday_school) || 0) +
                       (parseFloat(special_purpose_pledge) || 0);
    }

    if (calculatedTotal <= 0) {
      return res.status(400).json({ error: "Either total_amount or individual collection amounts must be provided" });
    }

    // Duplicate detection
    if (!req.body.force) {
      const dup = await new Promise((resolve, reject) => {
        req.db.get(
          'SELECT id, created_by, date FROM collections WHERE date = ? AND total_amount = ?',
          [date, calculatedTotal],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });
      if (dup) {
        return res.status(409).json({
          error: 'Duplicate entry detected',
          conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
        });
      }
    }

    // Auto-generate control_number if not provided
    let finalControlNumber = control_number || null;
    if (!finalControlNumber) {
      const year = new Date().getFullYear();
      const maxRow = await new Promise((resolve, reject) => {
        req.db.get(
          `SELECT control_number FROM collections WHERE control_number LIKE ? ORDER BY control_number DESC LIMIT 1`,
          [`${year}-%`],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });
      const maxNum = maxRow ? (parseInt(maxRow.control_number.match(/\d+$/)?.[0]) || 0) : 0;
      finalControlNumber = `${year}-${String(maxNum + 1).padStart(3, '0')}`;
    }

    const generalTithesAmount = parseFloat(general_tithes_offering) || 0;
    const pbcmShare = generalTithesAmount * 0.10;
    const pastoralTeamShare = generalTithesAmount * 0.10;
    const operationalFundShare = generalTithesAmount * 0.80;

    const insertQuery = `
      INSERT INTO collections (
        date, particular, control_number, payment_method, total_amount,
        general_tithes_offering, bank_interest,
        sisterhood_san_juan, sisterhood_labuin, brotherhood, youth, couples, sunday_school, special_purpose_pledge,
        pbcm_share, pastoral_team_share, operational_fund_share,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const baseParams = [
      date,
      particular || 'Collection Entry',
      null, // placeholder for control_number — filled in tryInsert
      payment_method || "Cash",
      calculatedTotal,
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
    ];

    // Retry up to 5 times if a generated control_number collides with an existing one
    const collectionId = await new Promise((resolve, reject) => {
      const tryInsert = (ctrlNum, attemptsLeft) => {
        const params = [...baseParams];
        params[2] = ctrlNum;
        req.db.run(insertQuery, params, function (err) {
          if (err) {
            const isCtrlConflict = err.code === 'SQLITE_CONSTRAINT' && err.message.includes('control_number');
            if (isCtrlConflict && attemptsLeft > 0) {
              const parts = ctrlNum.split('-');
              const nextSeq = String((parseInt(parts[parts.length - 1]) || 0) + 1).padStart(3, '0');
              const nextCtrl = `${parts.slice(0, -1).join('-')}-${nextSeq}`;
              tryInsert(nextCtrl, attemptsLeft - 1);
            } else {
              reject(err);
            }
          } else {
            resolve(this.lastID);
          }
        });
      };
      tryInsert(finalControlNumber, 5);
    });

    // Create fund allocation record (fire-and-forget)
    req.db.run(
      `INSERT INTO fund_allocation (collection_id, date, general_tithes_amount, pbcm_allocation, pastoral_team_allocation, operational_allocation) VALUES (?, ?, ?, ?, ?, ?)`,
      [collectionId, date, generalTithesAmount, pbcmShare, pastoralTeamShare, operationalFundShare]
    );

    if (custom_fields) {
      await saveCustomFieldValues(req.db, 'collections', collectionId, custom_fields);
    }

    res.json({ id: collectionId, message: "Collection added successfully" });

  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get collection by ID
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  req.db.get("SELECT * FROM collections WHERE id = ?", [id], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: "Collection not found" });
    }

    // Fetch custom field values
    try {
      const customFields = await getCustomFieldValues(req.db, 'collections', id);
      res.json({ ...row, custom_fields: customFields });
    } catch (customFieldErr) {
      console.error("Error fetching custom fields:", customFieldErr);
      res.json(row);
    }
  });
});

// Update collection
router.put("/:id", authenticateToken, async (req, res) => {
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
    custom_fields, // Custom field values
  } = req.body;

  // Validation - only date is required
  if (!date) {
    return res.status(400).json({
      error: "Date is required",
    });
  }

  // Auto-calculate total_amount if not provided but individual fields have values
  let calculatedTotal = total_amount;
  if (!total_amount || total_amount === 0) {
    calculatedTotal = (parseFloat(general_tithes_offering) || 0) +
                     (parseFloat(bank_interest) || 0) +
                     (parseFloat(sisterhood_san_juan) || 0) +
                     (parseFloat(sisterhood_labuin) || 0) +
                     (parseFloat(brotherhood) || 0) +
                     (parseFloat(youth) || 0) +
                     (parseFloat(couples) || 0) +
                     (parseFloat(sunday_school) || 0) +
                     (parseFloat(special_purpose_pledge) || 0);
  }

  // Validate that we have either a total_amount or some individual field values
  if (calculatedTotal <= 0) {
    return res.status(400).json({
      error: "Either total_amount or individual collection amounts must be provided",
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
      particular || 'Collection Entry',
      control_number || null,
      payment_method || "Cash",
      calculatedTotal,
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
    async function (err) {
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

      // Save custom field values if provided
      try {
        if (custom_fields) {
          await saveCustomFieldValues(req.db, 'collections', id, custom_fields);
        }
        res.json({ message: "Collection updated successfully" });
      } catch (customFieldErr) {
        console.error("Error saving custom fields:", customFieldErr);
        res.json({
          message: "Collection updated successfully, but custom fields may not have been saved",
          customFieldError: customFieldErr.message
        });
      }
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
