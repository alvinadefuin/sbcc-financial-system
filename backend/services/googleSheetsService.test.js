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
    const boldReqs = requests.filter((r) => r.repeatCell?.cell.userEnteredFormat.textFormat?.bold);
    expect(boldReqs).toHaveLength(2);
    expect(boldReqs[0].repeatCell.range).toEqual({ sheetId: 42, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 17 });
    const currencyReqs = requests.filter((r) => r.repeatCell?.cell.userEnteredFormat.numberFormat);
    expect(currencyReqs).toHaveLength(1);
    expect(currencyReqs[0].repeatCell.cell.userEnteredFormat.numberFormat.pattern).toBe('"₱"#,##0.00');
  });
});
