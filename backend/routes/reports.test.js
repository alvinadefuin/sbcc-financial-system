const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

jest.mock("../services/googleSheetsService", () => ({
  isReady: jest.fn(() => true),
  getServiceAccountEmail: jest.fn(() => "sa@test.iam.gserviceaccount.com"),
  ensureTabs: jest.fn(async (id, titles) => Object.fromEntries(titles.map((t, i) => [t, i]))),
  writeTab: jest.fn(async () => {}),
  formatTab: jest.fn(async () => {}),
}));

const googleSheetsService = require("../services/googleSheetsService");
const reportsRouter = require("./reports");

const JWT_SECRET = "your-secret-key-change-this";
const adminAuth = "Bearer " + jwt.sign({ id: 1, email: "admin@sbcc.church", role: "admin" }, JWT_SECRET);
const userAuth = "Bearer " + jwt.sign({ id: 2, email: "user@sbcc.church", role: "user" }, JWT_SECRET);

// PG-style promise db mock (also exercises dbAsync's promise path)
const makeDb = (overrides = {}) => ({
  get: jest.fn(async (sql) => (sql.includes("app_settings") ? { value: "sheet-123" } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1 })),
  ...overrides,
});

function makeApp(db) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use("/", reportsRouter);
  return app;
}

afterEach(() => jest.clearAllMocks());

describe("GET /sheet-status", () => {
  test("401 without token", async () => {
    await request(makeApp(makeDb())).get("/sheet-status").expect(401);
  });

  test("returns configured status with url and last sync", async () => {
    const db = makeDb({
      get: jest.fn(async (sql) =>
        sql.includes("app_settings")
          ? { value: "sheet-123" }
          : { year: 2025, status: "success", error: null, synced_by: "admin@sbcc.church", synced_at: "2026-06-11 07:42:00" }
      ),
    });
    const res = await request(makeApp(db)).get("/sheet-status").set("Authorization", userAuth).expect(200);
    expect(res.body).toMatchObject({
      success: true,
      configured: true,
      spreadsheetId: "sheet-123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123",
      serviceAccountEmail: "sa@test.iam.gserviceaccount.com",
    });
    expect(res.body.lastSync.year).toBe(2025);
  });

  test("unconfigured when no setting row", async () => {
    const db = makeDb({ get: jest.fn(async () => null) });
    const res = await request(makeApp(db)).get("/sheet-status").set("Authorization", userAuth).expect(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.spreadsheetUrl).toBeNull();
  });
});

describe("PUT /sheet-config", () => {
  test("403 for non-admin", async () => {
    await request(makeApp(makeDb()))
      .put("/sheet-config").set("Authorization", userAuth)
      .send({ spreadsheetId: "abc" }).expect(403);
  });

  test("extracts spreadsheet ID from a full URL and upserts", async () => {
    const db = makeDb();
    const res = await request(makeApp(db))
      .put("/sheet-config").set("Authorization", adminAuth)
      .send({ spreadsheetId: "https://docs.google.com/spreadsheets/d/1AbC-dEf_123456789012345/edit#gid=0" })
      .expect(200);
    expect(res.body.spreadsheetId).toBe("1AbC-dEf_123456789012345");
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO app_settings"),
      ["report_spreadsheet_id", "1AbC-dEf_123456789012345", "admin@sbcc.church"],
      expect.any(Function)
    );
  });

  test("400 for garbage input", async () => {
    await request(makeApp(makeDb()))
      .put("/sheet-config").set("Authorization", adminAuth)
      .send({ spreadsheetId: "not a sheet!!" }).expect(400);
  });
});

describe("POST /sync-sheet", () => {
  test("403 for non-admin", async () => {
    await request(makeApp(makeDb()))
      .post("/sync-sheet").set("Authorization", userAuth).send({ year: 2025 }).expect(403);
  });

  test("400 when no spreadsheet configured", async () => {
    const db = makeDb({ get: jest.fn(async () => null) });
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(400);
    expect(res.body.message).toMatch(/no report spreadsheet configured/i);
  });

  test("503 when credentials not ready", async () => {
    googleSheetsService.isReady.mockReturnValueOnce(false);
    await request(makeApp(makeDb()))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(503);
  });

  test("happy path: writes 5 tabs and logs success", async () => {
    const db = makeDb();
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tabsUpdated).toEqual([
      "2025 Summary", "2025 Collections", "2025 Expenses",
      "2025 Collections Detail", "2025 Expenses Detail",
    ]);
    expect(googleSheetsService.writeTab).toHaveBeenCalledTimes(5);
    expect(googleSheetsService.formatTab).toHaveBeenCalledTimes(5);
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO report_syncs"),
      [2025, "sheet-123", "admin@sbcc.church"],
      expect.any(Function)
    );
  });

  test("google 403 → 502 with share hint and failure logged", async () => {
    const db = makeDb();
    googleSheetsService.writeTab.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: 403 }));
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(502);
    expect(res.body.message).toContain("sa@test.iam.gserviceaccount.com");
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("'failed'"),
      [2025, "sheet-123", expect.stringContaining("sa@test.iam.gserviceaccount.com"), "admin@sbcc.church"],
      expect.any(Function)
    );
  });

  test("409 when a sync is already running", async () => {
    const db = makeDb();
    let release;
    googleSheetsService.writeTab.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; })
    );
    const app = makeApp(db);
    const first = request(app).post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 });
    const firstPromise = first.then((r) => r);
    // let the first request reach writeTab
    await new Promise((r) => setTimeout(r, 50));
    await request(app).post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(409);
    release();
    const firstRes = await firstPromise;
    expect(firstRes.status).toBe(200);
  });
});
