const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

/**
 * POST /api/google-sheets/export
 * Export financial records to Google Sheets
 */
router.post('/export', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId, dateFrom, dateTo, recordType } = req.body;

    // Validate required fields
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required'
      });
    }

    // Validate date range
    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Date range is required'
      });
    }

    // Initialize Google Sheets service if needed
    if (!googleSheetsService.isReady()) {
      const initialized = await googleSheetsService.initialize();
      if (!initialized) {
        return res.status(503).json({
          success: false,
          message: 'Google Sheets service is not configured. Please contact administrator.',
        });
      }
    }

    const results = {
      collections: null,
      expenses: null,
      summary: null,
    };

    // Fetch and export collections
    if (recordType === 'both' || recordType === 'collections') {
      const collections = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM collections
           WHERE date >= ? AND date <= ?
           ORDER BY date ASC`,
          [dateFrom, dateTo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (collections.length > 0) {
        results.collections = await googleSheetsService.updateCollections(
          spreadsheetId,
          collections
        );
      }
    }

    // Fetch and export expenses
    if (recordType === 'both' || recordType === 'expenses') {
      const expenses = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM expenses
           WHERE date >= ? AND date <= ?
           ORDER BY date ASC`,
          [dateFrom, dateTo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (expenses.length > 0) {
        results.expenses = await googleSheetsService.updateExpenses(
          spreadsheetId,
          expenses
        );
      }
    }

    // Create summary if both types are exported
    if (recordType === 'both') {
      const collections = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM collections
           WHERE date >= ? AND date <= ?`,
          [dateFrom, dateTo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const expenses = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM expenses
           WHERE date >= ? AND date <= ?`,
          [dateFrom, dateTo],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      results.summary = await googleSheetsService.updateSummary(spreadsheetId, {
        collections,
        expenses,
        dateRange: { from: dateFrom, to: dateTo },
      });
    }

    res.json({
      success: true,
      message: 'Financial records exported to Google Sheets successfully',
      results,
      exportedBy: req.user.email,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export to Google Sheets',
    });
  }
});

/**
 * GET /api/google-sheets/status
 * Check if Google Sheets integration is configured
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const isConfigured = googleSheetsService.isReady();

    if (!isConfigured) {
      await googleSheetsService.initialize();
    }

    res.json({
      success: true,
      configured: googleSheetsService.isReady(),
      message: googleSheetsService.isReady()
        ? 'Google Sheets integration is active'
        : 'Google Sheets integration not configured',
    });
  } catch (error) {
    res.json({
      success: false,
      configured: false,
      message: 'Google Sheets integration not available',
    });
  }
});

/**
 * POST /api/google-sheets/test
 * Test Google Sheets connection
 */
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID is required',
      });
    }

    if (!googleSheetsService.isReady()) {
      const initialized = await googleSheetsService.initialize();
      if (!initialized) {
        return res.status(503).json({
          success: false,
          message: 'Google Sheets service is not configured',
        });
      }
    }

    // Try to access the spreadsheet
    const { google } = require('googleapis');
    const sheets = google.sheets({ version: 'v4', auth: googleSheetsService.auth });

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    res.json({
      success: true,
      message: 'Successfully connected to Google Sheets',
      spreadsheetTitle: response.data.properties.title,
      sheets: response.data.sheets.map(sheet => sheet.properties.title),
    });
  } catch (error) {
    console.error('Google Sheets test failed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to connect to Google Sheets',
    });
  }
});

module.exports = router;
