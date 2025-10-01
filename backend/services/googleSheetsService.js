const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initialized = false;
  }

  /**
   * Initialize Google Sheets API with service account credentials
   */
  async initialize() {
    try {
      // Check if credentials file exists
      const credentialsPath = path.join(__dirname, '../config/google-credentials.json');

      if (!fs.existsSync(credentialsPath)) {
        console.warn('Google Sheets credentials not found. Please set up service account.');
        return false;
      }

      // Load service account credentials
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

      // Create auth client
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // Create sheets client
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.initialized = true;

      console.log('✓ Google Sheets API initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Sheets API:', error.message);
      return false;
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.initialized && this.sheets !== null;
  }

  /**
   * Update collections data in Google Sheets
   */
  async updateCollections(spreadsheetId, collections) {
    if (!this.isReady()) {
      await this.initialize();
      if (!this.isReady()) {
        throw new Error('Google Sheets service not initialized');
      }
    }

    try {
      const sheetName = 'Collections';

      // Prepare header row
      const headers = [
        'Date',
        'Description',
        'Control Number',
        'Payment Method',
        'General Tithes & Offering',
        'Sisterhood San Juan',
        'Youth',
        'Sunday School',
        'Bank Interest',
        'Miscellaneous',
        'Operating Funds',
        'Sisterhood Cabiao',
        'Total Amount',
        'Created By',
        'Last Updated'
      ];

      // Prepare data rows
      const rows = collections.map(item => [
        new Date(item.date).toLocaleDateString('en-US'),
        item.particular || '',
        item.control_number || '',
        item.payment_method || 'Cash',
        parseFloat(item.general_tithes_offering || 0).toFixed(2),
        parseFloat(item.sisterhood_san_juan || 0).toFixed(2),
        parseFloat(item.youth || 0).toFixed(2),
        parseFloat(item.sunday_school || 0).toFixed(2),
        parseFloat(item.bank_interest || 0).toFixed(2),
        parseFloat(item.miscellaneous || 0).toFixed(2),
        parseFloat(item.operating_funds || 0).toFixed(2),
        parseFloat(item.sisterhood_cabiao || 0).toFixed(2),
        parseFloat(item.total_amount || 0).toFixed(2),
        item.created_by || 'System',
        new Date(item.updated_at || item.created_at).toLocaleString('en-US')
      ]);

      // Combine headers and data
      const values = [headers, ...rows];

      // Clear existing data and write new data
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:Z`,
      });

      // Write new data
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values },
      });

      return {
        success: true,
        updatedRows: response.data.updatedRows,
        updatedCells: response.data.updatedCells,
      };
    } catch (error) {
      console.error('Error updating collections:', error);
      throw new Error(`Failed to update collections: ${error.message}`);
    }
  }

  /**
   * Update expenses data in Google Sheets
   */
  async updateExpenses(spreadsheetId, expenses) {
    if (!this.isReady()) {
      await this.initialize();
      if (!this.isReady()) {
        throw new Error('Google Sheets service not initialized');
      }
    }

    try {
      const sheetName = 'Expenses';

      // Prepare header row
      const headers = [
        'Date',
        'Description',
        'Category',
        'Forms Number',
        'Workers Share',
        'Supplies & Materials',
        'Utilities',
        'Repairs & Maintenance',
        'Transportation',
        'Communication',
        'Others',
        'Total Amount',
        'Created By',
        'Last Updated'
      ];

      // Prepare data rows
      const rows = expenses.map(item => [
        new Date(item.date).toLocaleDateString('en-US'),
        item.particular || '',
        item.category || '',
        item.forms_number || '',
        parseFloat(item.workers_share || 0).toFixed(2),
        parseFloat(item.supplies || 0).toFixed(2),
        parseFloat(item.utilities || 0).toFixed(2),
        parseFloat(item.repairs_maintenance || 0).toFixed(2),
        parseFloat(item.transportation || 0).toFixed(2),
        parseFloat(item.communication || 0).toFixed(2),
        parseFloat(item.others || 0).toFixed(2),
        parseFloat(item.total_amount || 0).toFixed(2),
        item.created_by || 'System',
        new Date(item.updated_at || item.created_at).toLocaleString('en-US')
      ]);

      // Combine headers and data
      const values = [headers, ...rows];

      // Clear existing data and write new data
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:Z`,
      });

      // Write new data
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values },
      });

      return {
        success: true,
        updatedRows: response.data.updatedRows,
        updatedCells: response.data.updatedCells,
      };
    } catch (error) {
      console.error('Error updating expenses:', error);
      throw new Error(`Failed to update expenses: ${error.message}`);
    }
  }

  /**
   * Update both collections and expenses
   */
  async updateFinancialRecords(spreadsheetId, { collections, expenses }) {
    const results = {
      collections: null,
      expenses: null,
      success: false,
    };

    try {
      if (collections && collections.length > 0) {
        results.collections = await this.updateCollections(spreadsheetId, collections);
      }

      if (expenses && expenses.length > 0) {
        results.expenses = await this.updateExpenses(spreadsheetId, expenses);
      }

      results.success = true;
      return results;
    } catch (error) {
      console.error('Error updating financial records:', error);
      throw error;
    }
  }

  /**
   * Create summary sheet with totals
   */
  async updateSummary(spreadsheetId, { collections, expenses, dateRange }) {
    if (!this.isReady()) {
      await this.initialize();
      if (!this.isReady()) {
        throw new Error('Google Sheets service not initialized');
      }
    }

    try {
      const sheetName = 'Summary';

      const totalCollections = collections.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
      const totalExpenses = expenses.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
      const netBalance = totalCollections - totalExpenses;

      const values = [
        ['SBCC Financial Summary'],
        [''],
        ['Report Period:', `${dateRange.from} to ${dateRange.to}`],
        ['Generated:', new Date().toLocaleString('en-US')],
        [''],
        ['Category', 'Amount'],
        ['Total Collections', totalCollections.toFixed(2)],
        ['Total Expenses', totalExpenses.toFixed(2)],
        ['Net Balance', netBalance.toFixed(2)],
        [''],
        ['Record Counts'],
        ['Collections Records', collections.length],
        ['Expense Records', expenses.length],
      ];

      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A1:Z`,
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values },
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating summary:', error);
      throw new Error(`Failed to update summary: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();
