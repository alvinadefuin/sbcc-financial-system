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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
            <h2 className="text-xl font-semibold">Update Google Sheets</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Configuration Warning */}
          {sheetsConfigured === false && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900">Google Sheets not configured</p>
                <p className="text-xs text-yellow-700 mt-1">
                  Please follow the setup instructions to enable Google Sheets integration.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Export Options */}
            <div className="flex items-center space-x-2 mb-4">
              <Settings className="h-5 w-5 text-gray-600" />
              <h3 className="text-lg font-medium">Export Options</h3>
            </div>

            {/* Spreadsheet ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Sheets Spreadsheet ID
              </label>
              <input
                type="text"
                value={exportOptions.spreadsheetId}
                onChange={(e) => handleInputChange('spreadsheetId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="1NQH1TmqqKZO3SWHyygLQ1W6T3YzJkQ_B"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in your Google Sheets URL: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
              </p>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Date From
                </label>
                <input
                  type="date"
                  value={exportOptions.dateFrom}
                  onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Date To
                </label>
                <input
                  type="date"
                  value={exportOptions.dateTo}
                  onChange={(e) => handleInputChange('dateTo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>

            {/* Record Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Record Type
              </label>
              <select
                value={exportOptions.recordType}
                onChange={(e) => handleInputChange('recordType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    status.type === 'success' ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {status.message}
                  </p>
                  {status.details && status.details.sheets && (
                    <p className="text-xs text-gray-600 mt-1">
                      Available sheets: {status.details.sheets.join(', ')}
                    </p>
                  )}
                  {status.details && status.details.collections && (
                    <p className="text-xs text-gray-600 mt-1">
                      Updated {status.details.collections.updatedRows} collection rows
                    </p>
                  )}
                  {status.details && status.details.expenses && (
                    <p className="text-xs text-gray-600 mt-1">
                      Updated {status.details.expenses.updatedRows} expense rows
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                onClick={testConnection}
                disabled={loading || !exportOptions.spreadsheetId}
                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>Test Connection</span>
              </button>

              <button
                onClick={handleExport}
                disabled={loading || !exportOptions.spreadsheetId || sheetsConfigured === false}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>Update Google Sheets</span>
              </button>
            </div>

            {/* Info Section */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-2">How it works:</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• This will export your financial records to the specified Google Sheets</li>
                <li>• Collections will be saved in "Collections" sheet</li>
                <li>• Expenses will be saved in "Expenses" sheet</li>
                <li>• A "Summary" sheet will be created with totals (when exporting both)</li>
                <li>• Existing data in the sheets will be replaced with new data</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateGoogleSheetModal;
