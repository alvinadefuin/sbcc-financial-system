// SQLite (sqlite3) db methods are callback-style; the PG adapter
// (config/database-pg.js) exposes async methods that ignore a callback arg.
// These wrappers support both: whichever settles first wins.
function callAsync(db, method, sql, params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (val) => { if (!settled) { settled = true; resolve(val); } };
    const fail = (err) => { if (!settled) { settled = true; reject(err); } };
    const maybe = db[method](sql, params, (err, result) =>
      err ? fail(err) : ok(result)
    );
    if (maybe && typeof maybe.then === "function") maybe.then(ok, fail);
  });
}

const dbAll = (db, sql, params = []) => callAsync(db, "all", sql, params);
const dbGet = (db, sql, params = []) => callAsync(db, "get", sql, params);
const dbRun = (db, sql, params = []) => callAsync(db, "run", sql, params);

module.exports = { dbAll, dbGet, dbRun };
