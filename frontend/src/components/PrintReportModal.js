import React, { useState, useEffect } from "react";
import { X, Calendar, FileText, Settings, Printer } from "lucide-react";
import apiService from "../utils/api";

const PrintReportModal = ({ isOpen, onClose, user }) => {
  const [reportOptions, setReportOptions] = useState({
    dateFrom: "",
    dateTo: "",
    recordType: "both", // both, collections, expenses
    includeBreakdown: true,
    reportTitle: "Financial Report"
  });

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  // Set default date range (current month)
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setReportOptions(prev => ({
      ...prev,
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: lastDay.toISOString().split('T')[0]
    }));
  }, [isOpen]);

  const handleInputChange = (field, value) => {
    setReportOptions(prev => ({
      ...prev,
      [field]: value
    }));
    setPreview(null); // Clear preview when options change
  };

  const generatePreview = async () => {
    try {
      setLoading(true);

      // Fetch filtered data based on options
      const promises = [];

      if (reportOptions.recordType === "both" || reportOptions.recordType === "collections") {
        promises.push(
          apiService.getCollections({
            dateFrom: reportOptions.dateFrom,
            dateTo: reportOptions.dateTo
          })
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      if (reportOptions.recordType === "both" || reportOptions.recordType === "expenses") {
        promises.push(
          apiService.getExpenses({
            dateFrom: reportOptions.dateFrom,
            dateTo: reportOptions.dateTo
          })
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      const [collections, expenses] = await Promise.all(promises);

      // Filter by date range on frontend (in case backend doesn't support it yet)
      const filteredCollections = collections.filter(item => {
        const itemDate = new Date(item.date);
        const fromDate = new Date(reportOptions.dateFrom);
        const toDate = new Date(reportOptions.dateTo);
        return itemDate >= fromDate && itemDate <= toDate;
      });

      const filteredExpenses = expenses.filter(item => {
        const itemDate = new Date(item.date);
        const fromDate = new Date(reportOptions.dateFrom);
        const toDate = new Date(reportOptions.dateTo);
        return itemDate >= fromDate && itemDate <= toDate;
      });

      setPreview({
        collections: filteredCollections,
        expenses: filteredExpenses,
        totalCollections: filteredCollections.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0),
        totalExpenses: filteredExpenses.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0)
      });

    } catch (error) {
      console.error("Error generating preview:", error);
      alert("Error generating report preview");
    } finally {
      setLoading(false);
    }
  };

  const generatePrintReport = () => {
    if (!preview) {
      alert("Please generate preview first");
      return;
    }

    const { collections, expenses, totalCollections, totalExpenses } = preview;
    const netBalance = totalCollections - totalExpenses;

    const printWindow = window.open('', '_blank');
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportOptions.reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header h2 { margin: 5px 0; font-size: 18px; color: #666; }
            .header p { margin: 5px 0; color: #888; }
            .report-info { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
            .report-info-item { display: inline-block; margin-right: 30px; }
            .summary { margin-bottom: 30px; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; }
            .summary-item { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .summary-item .value { font-size: 18px; font-weight: bold; color: #2563eb; }
            .summary-item .label { color: #666; margin-top: 5px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
            .table th { background-color: #f8f9fa; font-weight: bold; text-align: center; }
            .table .amount { text-align: right; font-family: monospace; }
            .section-title { background: #2563eb; color: white; padding: 10px; margin: 30px 0 10px 0; font-weight: bold; }
            .breakdown-section { margin-left: 20px; margin-top: 10px; }
            .breakdown-table { font-size: 10px; }
            .breakdown-table th { background-color: #e5e7eb; }
            .total-row { background-color: #f1f5f9; font-weight: bold; }
            @media print {
              .no-print { display: none; }
              body { margin: 0; font-size: 10px; }
              .table th, .table td { padding: 4px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SBCC Financial System</h1>
            <h2>${reportOptions.reportTitle}</h2>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
            <p>Prepared by: ${user.name} (${user.role})</p>
          </div>

          <div class="report-info">
            <div class="report-info-item"><strong>Report Period:</strong> ${new Date(reportOptions.dateFrom).toLocaleDateString()} - ${new Date(reportOptions.dateTo).toLocaleDateString()}</div>
            <div class="report-info-item"><strong>Record Type:</strong> ${reportOptions.recordType.charAt(0).toUpperCase() + reportOptions.recordType.slice(1)}</div>
            <div class="report-info-item"><strong>Breakdown:</strong> ${reportOptions.includeBreakdown ? 'Included' : 'Summary Only'}</div>
          </div>

          <div class="summary">
            <div class="summary-grid">
              ${reportOptions.recordType !== 'expenses' ? `
                <div class="summary-item">
                  <div class="value">₱${totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div class="label">Total Collections</div>
                </div>
              ` : ''}

              ${reportOptions.recordType !== 'collections' ? `
                <div class="summary-item">
                  <div class="value">₱${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div class="label">Total Expenses</div>
                </div>
              ` : ''}

              ${reportOptions.recordType === 'both' ? `
                <div class="summary-item">
                  <div class="value">₱${netBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div class="label">Net Balance</div>
                </div>
              ` : ''}
            </div>
          </div>

          ${reportOptions.recordType !== 'expenses' && collections.length > 0 ? `
            <div class="section-title">Collections (${collections.length} records)</div>
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 15%">Date</th>
                  <th style="width: 25%">Description</th>
                  <th style="width: 15%">Control #</th>
                  <th style="width: 15%">Payment Method</th>
                  <th style="width: 15%">Total Amount</th>
                  ${reportOptions.includeBreakdown ? `
                    <th style="width: 15%">Breakdown</th>
                  ` : ''}
                </tr>
              </thead>
              <tbody>
                ${collections.map(item => `
                  <tr>
                    <td>${new Date(item.date).toLocaleDateString()}</td>
                    <td>${item.particular || 'Collection Entry'}</td>
                    <td>${item.control_number || '-'}</td>
                    <td>${item.payment_method || 'Cash'}</td>
                    <td class="amount">₱${parseFloat(item.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    ${reportOptions.includeBreakdown ? `
                      <td style="font-size: 9px;">
                        ${item.general_tithes_offering && parseFloat(item.general_tithes_offering) > 0 ? `Tithes: ₱${parseFloat(item.general_tithes_offering).toLocaleString()}<br>` : ''}
                        ${item.sisterhood_san_juan && parseFloat(item.sisterhood_san_juan) > 0 ? `Sisterhood SJ: ₱${parseFloat(item.sisterhood_san_juan).toLocaleString()}<br>` : ''}
                        ${item.youth && parseFloat(item.youth) > 0 ? `Youth: ₱${parseFloat(item.youth).toLocaleString()}<br>` : ''}
                        ${item.sunday_school && parseFloat(item.sunday_school) > 0 ? `Sunday School: ₱${parseFloat(item.sunday_school).toLocaleString()}<br>` : ''}
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="${reportOptions.includeBreakdown ? '5' : '4'}" style="text-align: right; font-weight: bold;">Total Collections:</td>
                  <td class="amount" style="font-weight: bold;">₱${totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          ` : ''}

          ${reportOptions.recordType !== 'collections' && expenses.length > 0 ? `
            <div class="section-title">Expenses (${expenses.length} records)</div>
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 15%">Date</th>
                  <th style="width: 25%">Description</th>
                  <th style="width: 15%">Category</th>
                  <th style="width: 15%">Form #</th>
                  <th style="width: 15%">Total Amount</th>
                  ${reportOptions.includeBreakdown ? `
                    <th style="width: 15%">Breakdown</th>
                  ` : ''}
                </tr>
              </thead>
              <tbody>
                ${expenses.map(item => `
                  <tr>
                    <td>${new Date(item.date).toLocaleDateString()}</td>
                    <td>${item.particular || 'Expense Entry'}</td>
                    <td>${item.category || 'N/A'}</td>
                    <td>${item.forms_number || '-'}</td>
                    <td class="amount">₱${parseFloat(item.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    ${reportOptions.includeBreakdown ? `
                      <td style="font-size: 9px;">
                        ${item.workers_share && parseFloat(item.workers_share) > 0 ? `Workers: ₱${parseFloat(item.workers_share).toLocaleString()}<br>` : ''}
                        ${item.supplies && parseFloat(item.supplies) > 0 ? `Supplies: ₱${parseFloat(item.supplies).toLocaleString()}<br>` : ''}
                        ${item.utilities && parseFloat(item.utilities) > 0 ? `Utilities: ₱${parseFloat(item.utilities).toLocaleString()}<br>` : ''}
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="${reportOptions.includeBreakdown ? '5' : '4'}" style="text-align: right; font-weight: bold;">Total Expenses:</td>
                  <td class="amount" style="font-weight: bold;">₱${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          ` : ''}

          <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
            <p>This report is confidential and for authorized personnel only.</p>
            <p>© 2025 SBCC Financial System - Report generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Print Financial Report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Report Options heading */}
          <div className="flex items-center space-x-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Report Options</span>
          </div>

          {/* Report Title */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Report Title
            </label>
            <input
              type="text"
              value={reportOptions.reportTitle}
              onChange={(e) => handleInputChange('reportTitle', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="Financial Report"
            />
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
                value={reportOptions.dateFrom}
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
                value={reportOptions.dateTo}
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
              value={reportOptions.recordType}
              onChange={(e) => handleInputChange('recordType', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            >
              <option value="both">Both Collections & Expenses</option>
              <option value="collections">Collections Only</option>
              <option value="expenses">Expenses Only</option>
            </select>
          </div>

          {/* Breakdown Option */}
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={reportOptions.includeBreakdown}
                onChange={(e) => handleInputChange('includeBreakdown', e.target.checked)}
                className="rounded border-slate-200 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">
                Include detailed breakdown (individual categories)
              </span>
            </label>
            <p className="text-xs text-slate-400 mt-1">
              Shows individual amounts for tithes, offerings, expenses by category, etc.
            </p>
          </div>

          {/* Generate Preview button */}
          <div>
            <button
              onClick={generatePreview}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent"></div>
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>{loading ? 'Generating...' : 'Generate Preview'}</span>
            </button>
          </div>

          {/* Preview Panel */}
          {preview && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              <div className="text-center border-b border-slate-200 pb-3 mb-3">
                <h4 className="text-sm font-semibold text-slate-900">{reportOptions.reportTitle}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(reportOptions.dateFrom).toLocaleDateString()} - {new Date(reportOptions.dateTo).toLocaleDateString()}
                </p>
              </div>

              <div className="space-y-2">
                {reportOptions.recordType !== 'expenses' && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-xs font-medium text-blue-900">Collections</p>
                    <p className="text-xs text-blue-700">{preview.collections.length} records</p>
                    <p className="text-base font-bold text-blue-900">
                      ₱{preview.totalCollections.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}

                {reportOptions.recordType !== 'collections' && (
                  <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-xs font-medium text-red-900">Expenses</p>
                    <p className="text-xs text-red-700">{preview.expenses.length} records</p>
                    <p className="text-base font-bold text-red-900">
                      ₱{preview.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}

                {reportOptions.recordType === 'both' && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-xs font-medium text-green-900">Net Balance</p>
                    <p className="text-base font-bold text-green-900">
                      ₱{(preview.totalCollections - preview.totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 pt-2 mt-2 border-t border-slate-200">
                <p>Breakdown: {reportOptions.includeBreakdown ? 'Included' : 'Summary only'} — Ready to print</p>
              </div>
            </div>
          )}

          {!preview && !loading && (
            <div className="flex items-center justify-center h-24 text-slate-400 border border-dashed border-slate-200 rounded-lg">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">Click "Generate Preview" to see report summary</p>
              </div>
            </div>
          )}
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
            onClick={generatePrintReport}
            disabled={!preview}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintReportModal;
