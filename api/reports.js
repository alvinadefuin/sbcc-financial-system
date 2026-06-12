const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("./_lib/database");
const { JWT_SECRET } = require("./_lib/auth");
const googleSheetsService = require("./_lib/googleSheetsService");
const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
} = require("./_lib/reportService");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && ["admin", "super_admin"].includes(req.user.role)) return next();
  return res.status(403).json({ success: false, message: "Admin access required" });
}

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

const SPREADSHEET_ID_KEY = "report_spreadsheet_id";

let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await db.getPool().query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_by TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS report_syncs (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success','failed')),
      error TEXT,
      synced_by TEXT,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  tablesReady = true;
}

app.get("/api/reports/sheet-status", verifyToken, async (req, res) => {
  try {
    await ensureTables();
    const setting = await db.get("SELECT value FROM app_settings WHERE key = $1", [SPREADSHEET_ID_KEY]);
    const lastSync = await db.get(
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

app.put("/api/reports/sheet-config", verifyToken, requireAdmin, async (req, res) => {
  const spreadsheetId = extractSpreadsheetId(req.body.spreadsheetId);
  if (!spreadsheetId) {
    return res.status(400).json({ success: false, message: "Provide a valid Google Sheets URL or spreadsheet ID" });
  }
  try {
    await ensureTables();
    await db.run(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [SPREADSHEET_ID_KEY, spreadsheetId, req.user.email]
    );
    res.json({ success: true, spreadsheetId });
  } catch (error) {
    console.error("Report config error:", error);
    res.status(500).json({ success: false, message: "Failed to save spreadsheet settings" });
  }
});

let syncInProgress = false;

app.post("/api/reports/sync-sheet", verifyToken, requireAdmin, async (req, res) => {
  const year = parseInt(req.body.year, 10) || new Date().getFullYear();
  if (syncInProgress) {
    return res.status(409).json({ success: false, message: "A sync is already running — try again shortly" });
  }
  syncInProgress = true;
  let spreadsheetId = null;
  try {
    await ensureTables();
    const setting = await db.get("SELECT value FROM app_settings WHERE key = $1", [SPREADSHEET_ID_KEY]);
    spreadsheetId = setting?.value || null;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: "No report spreadsheet configured. Set it up in the Reports tab first." });
    }
    if (!googleSheetsService.isReady()) {
      return res.status(503).json({ success: false, message: "Google service account credentials are not configured on the server. See docs/GOOGLE_SHEETS_REPORT_SETUP.md." });
    }

    const collections = await db.all(
      "SELECT * FROM collections WHERE date >= $1 AND date <= $2 ORDER BY date",
      [`${year}-01-01`, `${year}-12-31`]
    );
    const expenses = await db.all(
      "SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY date",
      [`${year}-01-01`, `${year}-12-31`]
    );
    let budgetRows = [];
    try {
      budgetRows = await db.all(
        `SELECT bc.category, bc.subcategory, bc.budget_amount
         FROM budget_categories bc
         JOIN budget_plan bp ON bp.id = bc.budget_plan_id
         WHERE bp.year = $1`,
        [year]
      );
    } catch (budgetErr) {
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

    await db.run(
      "INSERT INTO report_syncs (year, spreadsheet_id, status, synced_by) VALUES ($1, $2, 'success', $3)",
      [year, spreadsheetId, req.user.email]
    );
    res.json({ success: true, year, tabsUpdated: grids.map((g) => g.title), syncedAt });
  } catch (error) {
    console.error("Report sync error:", error);
    const message = friendlyGoogleError(error);
    if (spreadsheetId) {
      try {
        await db.run(
          "INSERT INTO report_syncs (year, spreadsheet_id, status, error, synced_by) VALUES ($1, $2, 'failed', $3, $4)",
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

module.exports = app;
