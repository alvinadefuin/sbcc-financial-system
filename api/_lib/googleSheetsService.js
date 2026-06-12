const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.serviceAccountEmail = null;
    this.initialized = false;
  }

  loadCredentials() {
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      }
      const credentialsPath = path.join(__dirname, "../../backend/config/google-credentials.json");
      if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
      }
    } catch (error) {
      console.error("Failed to load Google credentials:", error.message);
    }
    return null;
  }

  initialize() {
    if (this.initialized) return true;
    const credentials = this.loadCredentials();
    if (!credentials) return false;
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    this.sheets = google.sheets({ version: "v4", auth });
    this.serviceAccountEmail = credentials.client_email || null;
    this.initialized = true;
    return true;
  }

  isReady() {
    return this.initialize();
  }

  getServiceAccountEmail() {
    this.initialize();
    return this.serviceAccountEmail;
  }

  async ensureTabs(spreadsheetId, titles) {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
    const byTitle = {};
    for (const sheet of meta.data.sheets) {
      byTitle[sheet.properties.title] = sheet.properties.sheetId;
    }
    const missing = titles.filter((t) => !(t in byTitle));
    if (missing.length > 0) {
      const res = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
        },
      });
      for (const reply of res.data.replies) {
        byTitle[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
      }
    }
    return byTitle;
  }

  async writeTab(spreadsheetId, title, values) {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${title}'`,
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "USER_ENTERED",
      resource: { values },
    });
  }

  async formatTab(spreadsheetId, sheetId, fmt, colCount) {
    const requests = [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: fmt.frozenRowCount || 0 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ];
    for (const rowIdx of fmt.boldRows || []) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.94, blue: 0.96 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      });
    }
    for (const range of fmt.currencyRanges || []) {
      requests.push({
        repeatCell: {
          range: { sheetId, ...range },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: '"₱"#,##0.00' } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
    await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
  }
}

module.exports = new GoogleSheetsService();
