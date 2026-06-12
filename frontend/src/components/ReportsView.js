// frontend/src/components/ReportsView.js
import React, { useState, useEffect, useCallback } from "react";
import { FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import apiService from "../utils/api";

const REPORT_START_YEAR = 2025;

const ReportsView = ({ user, collections, expenses, lastUpdated, formatCurrency }) => {
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [configInput, setConfigInput] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(null);
      setStatus(await apiService.getReportSheetStatus());
    } catch (e) {
      setStatusError(e.message);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSaveConfig = async () => {
    if (!configInput.trim()) return;
    setSavingConfig(true);
    setSyncResult(null);
    try {
      await apiService.saveReportSheetConfig(configInput.trim());
      setConfigInput("");
      setShowConfigEdit(false);
      await loadStatus();
    } catch (e) {
      setSyncResult({ ok: false, message: e.message });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await apiService.syncReportSheet(year);
      setSyncResult({ ok: true, message: `Updated ${data.tabsUpdated.length} tabs for ${data.year}` });
    } catch (e) {
      setSyncResult({ ok: false, message: e.message });
    } finally {
      setSyncing(false);
      loadStatus();
    }
  };

  const totalCollections = collections.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const netBalance = totalCollections - totalExpenses;

  const yearOptions = [];
  for (let y = new Date().getFullYear(); y >= REPORT_START_YEAR; y--) yearOptions.push(y);

  const showSetup = status && (!status.configured || showConfigEdit);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Financial Reports</h2>
        <p className="text-xs text-slate-400 mt-0.5">Last updated: {lastUpdated.toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Collections Total", value: totalCollections, count: collections.length, colorVal: "text-emerald-700", colorBg: "bg-emerald-500" },
          { label: "Expenses Total", value: totalExpenses, count: expenses.length, colorVal: "text-rose-700", colorBg: "bg-rose-500" },
          { label: "Net Surplus", value: netBalance, count: null, colorVal: netBalance >= 0 ? "text-emerald-700" : "text-rose-700", colorBg: netBalance >= 0 ? "bg-emerald-500" : "bg-rose-500" },
        ].map(({ label, value, count, colorVal, colorBg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-2 mb-3"><div className={`w-2 h-2 rounded-full ${colorBg}`} /><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p></div>
            <p className={`text-2xl font-bold tracking-tight ${colorVal}`}>₱{formatCurrency(value)}</p>
            {count !== null && <p className="text-xs text-slate-400 mt-1.5">{count} transactions</p>}
            {count === null && totalExpenses > 0 && <p className="text-xs text-slate-400 mt-1.5">{Math.round((totalCollections / totalExpenses) * 100)}% efficiency ratio</p>}
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-800">Google Sheets Report</h4>
          </div>
          {status?.configured && isAdmin && !showConfigEdit && (
            <button onClick={() => setShowConfigEdit(true)} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Change spreadsheet
            </button>
          )}
        </div>

        {!status && !statusError && <p className="text-sm text-slate-400">Loading…</p>}

        {statusError && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-rose-700">{statusError}</p>
          </div>
        )}

        {showSetup && (
          isAdmin ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Create a Google Sheet, share it as <strong>Editor</strong> with{" "}
                <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">
                  {status.serviceAccountEmail || "the service account (server credentials not set up yet)"}
                </span>
                , then paste its URL below. The system always updates this same file — it never creates new ones.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig || !configInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                >
                  {savingConfig ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              The report spreadsheet hasn't been set up yet — ask your admin to configure it.
            </p>
          )
        )}

        {status?.configured && !showConfigEdit && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {isAdmin && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Updating…" : "Update Report"}
                </button>
              )}
              <a
                href={status.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Open in Google Sheets <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-xs text-slate-400">
              {status.lastSync
                ? `Last updated ${new Date(status.lastSync.synced_at).toLocaleString()} by ${status.lastSync.synced_by || "unknown"} (${status.lastSync.year})`
                : "Never synced"}
              {status.lastSync?.status === "failed" && (
                <span className="text-rose-600"> — failed: {status.lastSync.error}</span>
              )}
            </p>

            {isAdmin && !status.credentialsReady && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Server credentials missing — set the GOOGLE_SERVICE_ACCOUNT_JSON environment variable.
                  See docs/GOOGLE_SHEETS_REPORT_SETUP.md.
                </p>
              </div>
            )}

            {syncResult && (
              <div className={`flex items-start gap-2 rounded-xl px-4 py-3 border ${syncResult.ok ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
                {syncResult.ok
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />}
                <p className={`text-xs ${syncResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{syncResult.message}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
