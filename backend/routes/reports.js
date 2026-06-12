const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const googleSheetsService = require("../services/googleSheetsService");
const { dbAll, dbGet, dbRun } = require("../utils/dbAsync");
const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
} = require("../services/reportService");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const SPREADSHEET_ID_KEY = "report_spreadsheet_id";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user && ["admin", "super_admin"].includes(req.user.role)) return next();
  return res.status(403).json({ success: false, message: "Admin access required" });
};

function extractSpreadsheetId(input) {
  if (!input) return null;
  const urlMatch = String(input).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  const trimmed = String(input).trim();
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}

function friendlyGoogleError(error) {
  const code = error.code || error.response?.status;
  if (code === 403) {
    const email = googleSheetsService.getServiceAccountEmail();
    return `Google denied access. Share the spreadsheet (Editor) with the service account: ${email || "(service account email unavailable)"}`;
  }
  if (code === 404) return "Spreadsheet not found — check the URL/ID in the report settings";
  return error.message || "Failed to update Google Sheet";
}

let syncInProgress = false;

router.get("/sheet-status", authenticateToken, async (req, res) => {
  try {
    const setting = await dbGet(req.db, "SELECT value FROM app_settings WHERE key = ?", [SPREADSHEET_ID_KEY]);
    const lastSync = await dbGet(
      req.db,
      "SELECT year, status, error, synced_by, synced_at FROM report_syncs ORDER BY id DESC LIMIT 1"
    );
    const spreadsheetId = setting?.value || null;
    res.json({
      success: true,
      configured: !!spreadsheetId,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null,
      credentialsReady: googleSheetsService.isReady(),
      serviceAccountEmail: googleSheetsService.getServiceAccountEmail(),
      lastSync: lastSync || null,
    });
  } catch (error) {
    console.error("Report status error:", error);
    res.status(500).json({ success: false, message: "Failed to load report status" });
  }
});

router.put("/sheet-config", authenticateToken, requireAdmin, async (req, res) => {
  const spreadsheetId = extractSpreadsheetId(req.body.spreadsheetId);
  if (!spreadsheetId) {
    return res.status(400).json({ success: false, message: "Provide a valid Google Sheets URL or spreadsheet ID" });
  }
  try {
    await dbRun(
      req.db,
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [SPREADSHEET_ID_KEY, spreadsheetId, req.user.email]
    );
    res.json({ success: true, spreadsheetId });
  } catch (error) {
    console.error("Report config error:", error);
    res.status(500).json({ success: false, message: "Failed to save spreadsheet settings" });
  }
});

router.post("/sync-sheet", authenticateToken, requireAdmin, async (req, res) => {
  const year = parseInt(req.body.year, 10) || new Date().getFullYear();
  if (syncInProgress) {
    return res.status(409).json({ success: false, message: "A sync is already running — try again shortly" });
  }
  syncInProgress = true;
  let spreadsheetId = null;
  try {
    const setting = await dbGet(req.db, "SELECT value FROM app_settings WHERE key = ?", [SPREADSHEET_ID_KEY]);
    spreadsheetId = setting?.value || null;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: "No report spreadsheet configured. Set it up in the Reports tab first." });
    }
    if (!googleSheetsService.isReady()) {
      return res.status(503).json({ success: false, message: "Google service account credentials are not configured on the server. See docs/GOOGLE_SHEETS_REPORT_SETUP.md." });
    }

    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    const collections = await dbAll(req.db, "SELECT * FROM collections WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
    const expenses = await dbAll(req.db, "SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
    let budgetRows = [];
    try {
      budgetRows = await dbAll(
        req.db,
        `SELECT bc.category, bc.subcategory, bc.budget_amount
         FROM budget_categories bc
         JOIN budget_plan bp ON bp.id = bc.budget_plan_id
         WHERE bp.year = ?`,
        [year]
      );
    } catch (budgetErr) {
      // Budget tables may not exist yet (older PG deployments) — report still works, budget columns blank
      console.warn("Budget lookup failed, continuing without budget:", budgetErr.message);
    }

    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses(expenses, budgetRows);
    const summary = buildSummary(colAgg, expAgg);
    const syncedAt = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const grids = buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: expenses }, syncedAt);

    const tabIds = await googleSheetsService.ensureTabs(spreadsheetId, grids.map((g) => g.title));
    for (const grid of grids) {
      await googleSheetsService.writeTab(spreadsheetId, grid.title, grid.values);
      const colCount = Math.max(...grid.values.map((r) => r.length));
      await googleSheetsService.formatTab(spreadsheetId, tabIds[grid.title], grid.fmt, colCount);
    }

    await dbRun(
      req.db,
      "INSERT INTO report_syncs (year, spreadsheet_id, status, synced_by) VALUES (?, ?, 'success', ?)",
      [year, spreadsheetId, req.user.email]
    );
    res.json({ success: true, year, tabsUpdated: grids.map((g) => g.title), syncedAt });
  } catch (error) {
    console.error("Report sync error:", error);
    const message = friendlyGoogleError(error);
    if (spreadsheetId) {
      try {
        await dbRun(
          req.db,
          "INSERT INTO report_syncs (year, spreadsheet_id, status, error, synced_by) VALUES (?, ?, 'failed', ?, ?)",
          [year, spreadsheetId, message, req.user.email]
        );
      } catch (logErr) {
        console.error("Failed to log sync failure:", logErr);
      }
    }
    res.status(502).json({ success: false, message });
  } finally {
    syncInProgress = false;
  }
});

module.exports = router;
