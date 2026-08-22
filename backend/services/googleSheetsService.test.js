jest.mock("googleapis", () => {
  const sheetsApi = {
    spreadsheets: {
      get: jest.fn(),
      batchUpdate: jest.fn(),
      values: { clear: jest.fn(), update: jest.fn() },
    },
  };
  return {
    google: {
      auth: { GoogleAuth: jest.fn() },
      sheets: jest.fn(() => sheetsApi),
      __sheetsApi: sheetsApi,
    },
  };
});

const SA_JSON = JSON.stringify({
  client_email: "sa@test.iam.gserviceaccount.com",
  private_key: "fake-key",
});

const CURRENCY_RANGE = { startRowIndex: 1, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 14 };

// The reset request carries `cell: {}`, so these have to tolerate a missing
// userEnteredFormat rather than reaching straight through it.
const boldRequests = (requests) =>
  requests.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold);
const currencyRequests = (requests) =>
  requests.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat);

describe("googleSheetsService", () => {
  let service;
  let sheetsApi;

  beforeEach(() => {
    jest.resetModules();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    const { google } = require("googleapis");
    sheetsApi = google.__sheetsApi;
    service = require("./googleSheetsService");
  });

  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  test("initializes from GOOGLE_SERVICE_ACCOUNT_JSON env var", () => {
    expect(service.isReady()).toBe(true);
    expect(service.getServiceAccountEmail()).toBe("sa@test.iam.gserviceaccount.com");
  });

  test("not ready when no env var and no credentials file", () => {
    jest.resetModules();
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const fresh = require("./googleSheetsService");
    // repo has no backend/config/google-credentials.json
    expect(fresh.isReady()).toBe(false);
    expect(fresh.getServiceAccountEmail()).toBeNull();
  });

  test("ensureTabs creates only missing tabs and returns title→sheetId map", async () => {
    service.isReady();
    sheetsApi.spreadsheets.get.mockResolvedValue({
      data: { sheets: [{ properties: { title: "2025 Summary", sheetId: 11 } }] },
    });
    sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { title: "2025 Collections", sheetId: 22 } } }] },
    });

    const map = await service.ensureTabs("sheet-1", ["2025 Summary", "2025 Collections"]);

    expect(map).toEqual({ "2025 Summary": 11, "2025 Collections": 22 });
    expect(sheetsApi.spreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      resource: { requests: [{ addSheet: { properties: { title: "2025 Collections" } } }] },
    });
  });

  test("ensureTabs skips batchUpdate when all tabs exist", async () => {
    service.isReady();
    sheetsApi.spreadsheets.get.mockResolvedValue({
      data: { sheets: [{ properties: { title: "2025 Summary", sheetId: 11 } }] },
    });
    await service.ensureTabs("sheet-1", ["2025 Summary"]);
    expect(sheetsApi.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });

  test("writeTab clears then updates with USER_ENTERED", async () => {
    service.isReady();
    sheetsApi.spreadsheets.values.clear.mockResolvedValue({});
    sheetsApi.spreadsheets.values.update.mockResolvedValue({});

    await service.writeTab("sheet-1", "2025 Summary", [["a"]]);

    expect(sheetsApi.spreadsheets.values.clear).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "'2025 Summary'",
    });
    expect(sheetsApi.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "'2025 Summary'!A1",
      valueInputOption: "USER_ENTERED",
      resource: { values: [["a"]] },
    });
  });

  test("formatTab sends frozen rows, bold rows, and currency formats", async () => {
    service.isReady();
    sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

    const fmt = {
      frozenRowCount: 1,
      boldRows: [0, 10],
      currencyRanges: [{ startRowIndex: 1, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 14 }],
    };
    await service.formatTab("sheet-1", 42, fmt, 17);

    const { requests } = sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource;
    expect(requests[0].updateSheetProperties.properties.gridProperties.frozenRowCount).toBe(1);
    const boldReqs = boldRequests(requests);
    expect(boldReqs).toHaveLength(2);
    expect(boldReqs[0].repeatCell.range).toEqual({ sheetId: 42, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 17 });
    const currencyReqs = currencyRequests(requests);
    expect(currencyReqs).toHaveLength(1);
    expect(currencyReqs[0].repeatCell.cell.userEnteredFormat.numberFormat.pattern)
      .toBe('"₱"#,##0.00;-"₱"#,##0.00;"-"');
  });

  // A cell with no data holds a numeric 0, which the old single-section pattern
  // rendered as ₱0.00 across every empty month. The third section is what a zero
  // uses, so those read as a dash instead.
  test("a zero renders as a dash, not ₱0.00", async () => {
    service.isReady();
    sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

    await service.formatTab("sheet-1", 42, { currencyRanges: [CURRENCY_RANGE] }, 17);

    const [positive, negative, zero] = currencyRequests(
      sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource.requests
    )[0].repeatCell.cell.userEnteredFormat.numberFormat.pattern.split(";");

    expect(zero).toBe('"-"');
    // Negatives keep the leading minus they render with today.
    expect(positive).toBe('"₱"#,##0.00');
    expect(negative).toBe('-"₱"#,##0.00');
  });

  // values.clear() clears values only — the Sheets API leaves formatting alone.
  // Without an explicit reset, bold and background from a previous layout stay
  // on whatever row now occupies that index. The Summary tab shifts by ten rows
  // the first time a budget exists, which lands stale highlights on the pastoral
  // ministry sub-category rows.
  describe("stale formatting from a previous layout", () => {
    test("the whole sheet's formatting is reset before anything is applied", async () => {
      service.isReady();
      sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.formatTab("sheet-1", 42, { boldRows: [0, 3] }, 17);

      const { requests } = sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource;
      const reset = requests.find(
        (r) => r.repeatCell?.fields === "userEnteredFormat" && !r.repeatCell.cell.userEnteredFormat
      );

      expect(reset).toBeDefined();
      // No row or column bounds: the whole tab, so it cannot miss rows that the
      // new layout is shorter than the old one.
      expect(reset.repeatCell.range).toEqual({ sheetId: 42 });
    });

    test("the reset precedes every bold and currency request", async () => {
      service.isReady();
      sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.formatTab(
        "sheet-1", 42,
        { frozenRowCount: 1, boldRows: [0, 3], currencyRanges: [CURRENCY_RANGE] },
        17
      );

      const { requests } = sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource;
      const resetIdx = requests.findIndex(
        (r) => r.repeatCell?.fields === "userEnteredFormat" && !r.repeatCell.cell.userEnteredFormat
      );
      const paintIdxs = [...boldRequests(requests), ...currencyRequests(requests)]
        .map((r) => requests.indexOf(r));

      expect(resetIdx).toBeGreaterThanOrEqual(0);
      expect(paintIdxs.length).toBe(3);
      // batchUpdate applies requests in order: a reset after a paint would erase it.
      for (const i of paintIdxs) expect(resetIdx).toBeLessThan(i);
    });

    test("the reset is sent even when the tab has nothing to highlight", async () => {
      service.isReady();
      sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.formatTab("sheet-1", 42, {}, 17);

      const { requests } = sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource;
      expect(
        requests.some(
          (r) => r.repeatCell?.fields === "userEnteredFormat" && !r.repeatCell.cell.userEnteredFormat
        )
      ).toBe(true);
    });
  });
});
