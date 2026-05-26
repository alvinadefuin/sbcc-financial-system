import React, { useState, useEffect } from "react";
import { X, Calendar, FileSpreadsheet, Settings, Upload, CheckCircle, AlertCircle } from "lucide-react";
import apiService from "../utils/api";

const UpdateGoogleSheetModal = ({ isOpen, onClose, user }) => {
  const [exportOptions, setExportOptions] = useState({
    dateFrom: "",
    dateTo: "",
    recordType: "both", // both, collections, expenses
    spreadsheetId: "1NQH1TmqqKZO3SWHyygLQ1W6T3YzJkQ_B" // Default spreadsheet ID
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }
  const [sheetsConfigured, setSheetsConfigured] = useState(null);

  // Set default date range (current month)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setExportOptions(prev => ({
      ...prev,
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0]
    }));

    // Check if Google Sheets is configured
    checkSheetsStatus();
  }, [isOpen]);

  const checkSheetsStatus = async () => {
    try {
      const response = await apiService.get('/google-sheets/status');
      setSheetsConfigured(response.configured);
    } catch (error) {
      console.error('Error checking Google Sheets status:', error);
      setSheetsConfigured(false);
    }
  };

  const handleInputChange = (field, value) => {
    setExportOptions(prev => ({
      ...prev,
      [field]: value
    }));
    setStatus(null); // Clear status when options change
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      setStatus(null);

      // Validate inputs
      if (!exportOptions.spreadsheetId) {
        setStatus({
          type: 'error',
          message: 'Please enter a Google Sheets Spreadsheet ID'
        });
        return;
      }

      if (!exportOptions.dateFrom || !exportOptions.dateTo) {
        setStatus({
          type: 'error',
          message: 'Please select a valid date range'
        });
        return;
      }

      // Call API to export data
      const response = await apiService.post('/google-sheets/export', {
        spreadsheetId: exportOptions.spreadsheetId,
        dateFrom: exportOptions.dateFrom,
        dateTo: exportOptions.dateTo,
        recordType: exportOptions.recordType
      });

      if (response.success) {
        setStatus({
          type: 'success',
          message: 'Financial records successfully exported to Google Sheets!',
          details: response.results
        });
      } else {
        setStatus({
          type: 'error',
          message: response.message || 'Failed to export to Google Sheets'
        });
      }
    } catch (error) {
      console.error('Error exporting to Google Sheets:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.message || 'Failed to export to Google Sheets. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      setLoading(true);
      setStatus(null);

      const response = await apiService.post('/google-sheets/test', {
        spreadsheetId: exportOptions.spreadsheetId
      });

      if (response.success) {
        setStatus({
          type: 'success',
          message: `Connected to "${response.spreadsheetTitle}"`,
          details: { sheets: response.sheets }
        });
      } else {
        setStatus({
          type: 'error',
          message: response.message || 'Failed to connect to Google Sheets'
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.message || 'Failed to connect to Google Sheets'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Export to Google Sheets</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Configuration Warning */}
          {sheetsConfigured === false && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Google Sheets not configured</p>
                <p className="text-xs text-yellow-700 mt-1">
                  Please follow the setup instructions to enable Google Sheets integration.
                </p>
              </div>
            </div>
          )}

          {/* Export Options heading */}
          <div className="flex items-center space-x-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Export Options</span>
          </div>

          {/* Spreadsheet ID */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Google Sheets Spreadsheet ID
            </label>
            <input
              type="text"
              value={exportOptions.spreadsheetId}
              onChange={(e) => handleInputChange('spreadsheetId', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="1NQH1TmqqKZO3SWHyygLQ1W6T3YzJkQ_B"
            />
            <p className="text-xs text-slate-400 mt-1">
              Find this in your Google Sheets URL: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
            </p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Date From
              </label>
              <input
                type="date"
                value={exportOptions.dateFrom}
                onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                Date To
              </label>
              <input
                type="date"
                value={exportOptions.dateTo}
                onChange={(e) => handleInputChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          </div>

          {/* Record Type */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Record Type
            </label>
            <select
              value={exportOptions.recordType}
              onChange={(e) => handleInputChange('recordType', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            >
              <option value="both">Both Collections & Expenses</option>
              <option value="collections">Collections Only</option>
              <option value="expenses">Expenses Only</option>
            </select>
          </div>

          {/* Status Messages */}
          {status && (
            <div className={`p-4 rounded-lg flex items-start space-x-3 ${
              status.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {status.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  status.type === 'success' ? 'text-green-900' : 'text-red-900'
                }`}>
                  {status.message}
                </p>
                {status.details && status.details.sheets && (
                  <p className="text-xs text-slate-500 mt-1">
                    Available sheets: {status.details.sheets.join(', ')}
                  </p>
                )}
                {status.details && status.details.collections && (
                  <p className="text-xs text-slate-500 mt-1">
                    Updated {status.details.collections.updatedRows} collection rows
                  </p>
                )}
                {status.details && status.details.expenses && (
                  <p className="text-xs text-slate-500 mt-1">
                    Updated {status.details.expenses.updatedRows} expense rows
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Test Connection button */}
          <div>
            <button
              onClick={testConnection}
              disabled={loading || !exportOptions.spreadsheetId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent"></div>
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              <span>Test Connection</span>
            </button>
          </div>

          {/* Info Section */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-xs font-medium text-blue-900 mb-2">How it works:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>This will export your financial records to the specified Google Sheets</li>
              <li>Collections will be saved in "Collections" sheet</li>
              <li>Expenses will be saved in "Expenses" sheet</li>
              <li>A "Summary" sheet will be created with totals (when exporting both)</li>
              <li>Existing data in the sheets will be replaced with new data</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !exportOptions.spreadsheetId || sheetsConfigured === false}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Export
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateGoogleSheetModal;
