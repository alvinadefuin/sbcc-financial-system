// SQLite (sqlite3) db methods are callback-style; the PG adapter
// (config/database-pg.js) exposes async methods that return a promise.
// These wrappers support both by probing first: if the method returns a
// thenable (PG / async mock), use it directly with (sql, params) so the
// caller sees exactly two arguments. If calling without a callback throws
// synchronously (sqlite3-style mock that requires a callback), fall back to
// the three-arg form. Real sqlite3 returns `this` (non-thenable), so it also
// takes the callback path on the second call.
function callAsync(db, method, sql, params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (val) => { if (!settled) { settled = true; resolve(val); } };
    const fail = (err) => { if (!settled) { settled = true; reject(err); } };

    // Try without callback first (promise/async style).
    let maybe;
    let threwSync = false;
    try {
      maybe = db[method](sql, params);
    } catch (e) {
      threwSync = true;
    }

    if (!threwSync && maybe && typeof maybe.then === "function") {
      maybe.then(ok, fail);
    } else {
      // Callback-style (sqlite3): fall back to the three-arg form.
      db[method](sql, params, (err, result) => err ? fail(err) : ok(result));
    }
  });
}

const dbAll = (db, sql, params = []) => callAsync(db, "all", sql, params);
const dbGet = (db, sql, params = []) => callAsync(db, "get", sql, params);
const dbRun = (db, sql, params = []) => callAsync(db, "run", sql, params);

module.exports = { dbAll, dbGet, dbRun };
