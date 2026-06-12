const { dbAll, dbGet, dbRun } = require("./dbAsync");

describe("dbAsync", () => {
  test("resolves via callback style (sqlite3)", async () => {
    const db = { all: (sql, params, cb) => cb(null, [{ id: 1 }]) };
    await expect(dbAll(db, "SELECT 1", [])).resolves.toEqual([{ id: 1 }]);
  });

  test("rejects via callback error (sqlite3)", async () => {
    const db = { get: (sql, params, cb) => cb(new Error("boom")) };
    await expect(dbGet(db, "SELECT 1", [])).rejects.toThrow("boom");
  });

  test("resolves via promise style (pg adapter ignores callback arg)", async () => {
    const db = { all: async (sql, params) => [{ id: 2 }] };
    await expect(dbAll(db, "SELECT 1", [])).resolves.toEqual([{ id: 2 }]);
  });

  test("rejects via promise style", async () => {
    const db = { run: async () => { throw new Error("pg down"); } };
    await expect(dbRun(db, "INSERT", [])).rejects.toThrow("pg down");
  });

  test("params default to empty array", async () => {
    const db = { get: jest.fn((sql, params, cb) => cb(null, { ok: true })) };
    await dbGet(db, "SELECT 1");
    expect(db.get).toHaveBeenCalledWith("SELECT 1", [], expect.any(Function));
  });
});
