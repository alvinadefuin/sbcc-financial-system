// frontend/src/components/ReportsView.test.js
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReportsView from "./ReportsView";
import apiService from "../utils/api";

jest.mock("../utils/api", () => ({
  __esModule: true,
  default: {
    getReportSheetStatus: jest.fn(),
    syncReportSheet: jest.fn(),
    saveReportSheetConfig: jest.fn(),
  },
}));

const baseProps = {
  user: { role: "admin" },
  collections: [],
  expenses: [],
  lastUpdated: new Date("2026-06-11T10:00:00"),
  formatCurrency: (v) => Number(v).toLocaleString(),
};

const configuredStatus = {
  success: true,
  configured: true,
  spreadsheetId: "sheet-123",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123",
  credentialsReady: true,
  serviceAccountEmail: "sa@test.iam.gserviceaccount.com",
  lastSync: null,
};

afterEach(() => jest.clearAllMocks());

test("admin sees setup input with service account email when not configured", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  render(<ReportsView {...baseProps} />);
  expect(await screen.findByPlaceholderText(/docs\.google\.com/)).toBeInTheDocument();
  expect(screen.getByText(/sa@test\.iam\.gserviceaccount\.com/)).toBeInTheDocument();
});

test("non-admin sees ask-your-admin message when not configured", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  render(<ReportsView {...baseProps} user={{ role: "user" }} />);
  expect(await screen.findByText(/ask your admin/i)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/docs\.google\.com/)).not.toBeInTheDocument();
});

test("saving config sends the pasted URL", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  apiService.saveReportSheetConfig.mockResolvedValue({ success: true, spreadsheetId: "abc" });
  render(<ReportsView {...baseProps} />);
  const input = await screen.findByPlaceholderText(/docs\.google\.com/);
  fireEvent.change(input, { target: { value: "https://docs.google.com/spreadsheets/d/abc/edit" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() =>
    expect(apiService.saveReportSheetConfig).toHaveBeenCalledWith("https://docs.google.com/spreadsheets/d/abc/edit")
  );
});

test("configured: update button syncs the selected year and shows success", async () => {
  apiService.getReportSheetStatus.mockResolvedValue(configuredStatus);
  apiService.syncReportSheet.mockResolvedValue({
    success: true, year: 2025,
    tabsUpdated: ["2025 Summary", "2025 Collections", "2025 Expenses", "2025 Collections Detail", "2025 Expenses Detail"],
  });
  render(<ReportsView {...baseProps} />);
  const button = await screen.findByRole("button", { name: /update report/i });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "2025" } });
  fireEvent.click(button);
  await waitFor(() => expect(apiService.syncReportSheet).toHaveBeenCalledWith(2025));
  expect(await screen.findByText(/updated 5 tabs for 2025/i)).toBeInTheDocument();
  const link = screen.getByRole("link", { name: /open in google sheets/i });
  expect(link).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/sheet-123");
});

test("configured: failed sync shows the error message", async () => {
  apiService.getReportSheetStatus.mockResolvedValue(configuredStatus);
  apiService.syncReportSheet.mockRejectedValue(new Error("Google denied access. Share the spreadsheet"));
  render(<ReportsView {...baseProps} />);
  fireEvent.click(await screen.findByRole("button", { name: /update report/i }));
  expect(await screen.findByText(/google denied access/i)).toBeInTheDocument();
});
