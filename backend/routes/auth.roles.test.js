const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role, tv: 0 }, JWT_SECRET);

const makeApp = (target) => {
  // User mutations run inside a transaction now, so the UPDATE lands on tx.
  const tx = {
    run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
    get: jest.fn(async () => null),
    all: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
  };
  const db = {
    tx,
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      return cb(null, target);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [{ id: 1 }, { id: 2 }])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
    withTransaction: jest.fn(async (fn) => fn(tx)),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/auth', require('./auth'));
  return { app, db, tx };
};

test('promoting to super_admin as an admin is an explicit 403, not a silent no-op', async () => {
  const { app, tx } = makeApp({ id: 1, email: 't@sbcc.church', role: 'user', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
  expect(tx.run.mock.calls.some(([sql]) => /role\s*=/.test(sql))).toBe(false);
});

test('a super_admin may promote another account to super_admin', async () => {
  const { app, tx } = makeApp({ id: 1, email: 't@sbcc.church', role: 'admin', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = tx.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
  expect(roleUpdate[1]).toContain('super_admin');
});

describe('last-super-admin guard', () => {
  const makeGuardApp = (target, remainingSupers) => {
    const tx = {
      run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
      get: jest.fn(async () => null),
      all: jest.fn(async () => remainingSupers),
    };
    const db = {
      tx,
      get: jest.fn((sql, params, cb) =>
        /token_version FROM users/i.test(sql) ? cb(null, { token_version: 0 }) : cb(null, target)
      ),
      all: jest.fn((sql, params, cb) => cb(null, remainingSupers)),
      run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
      withTransaction: jest.fn(async (fn) => fn(tx)),
    };
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.db = db; next(); });
    app.use('/api/auth', require('./auth'));
    return { app, db, tx };
  };

  const lastSuper = { id: 1, email: 'last@sbcc.church', role: 'super_admin', is_active: true };

  test('demoting the only active super admin is refused with 409', async () => {
    const { app, tx } = makeGuardApp(lastSuper, [{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last super admin/i);
    expect(tx.run.mock.calls.some(([sql]) => /UPDATE users/i.test(sql))).toBe(false);
  });

  test('deactivating the only active super admin is refused with 409', async () => {
    const { app } = makeGuardApp(lastSuper, [{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(409);
  });

  test('demoting one of two super admins is allowed, counted with FOR UPDATE', async () => {
    const { app, tx } = makeGuardApp(lastSuper, [{ id: 1 }, { id: 2 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const counted = tx.all.mock.calls.find(([sql]) => /super_admin/i.test(sql));
    expect(counted[0]).toMatch(/FOR UPDATE/i);
  });

  test('deleting a super admin is refused with a 409 that explains why', async () => {
    const { app, db } = makeGuardApp(lastSuper, [{ id: 1 }, { id: 2 }]);

    const res = await request(app)
      .delete('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'));

    expect(res.status).toBe(409);
    expect(db.run.mock.calls.some(([sql]) => /DELETE FROM users/i.test(sql))).toBe(false);
  });
});

// Mirrors api/auth.roles.test.js. Authorization reads the role out of the JWT,
// never the database, so a role change is invisible to a session minted before
// it — a promoted collector keeps getting 403, a demoted admin keeps their
// powers, until the token expires. Bumping token_version ends the old session.
describe('a role or activation change revokes existing sessions', () => {
  test('changing a role bumps token_version', async () => {
    const { app, tx } = makeApp({ id: 1, email: 't@sbcc.church', role: 'user', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const bump = tx.run.mock.calls.find(([sql]) => /token_version\s*=/i.test(sql));
    expect(bump).toBeDefined();
    expect(bump[0]).toMatch(/token_version\s*=\s*(COALESCE\()?token_version/i);
  });

  test('deactivating an account bumps token_version', async () => {
    const { app, tx } = makeApp({ id: 1, email: 't@sbcc.church', role: 'admin', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(tx.run.mock.calls.some(([sql]) => /token_version\s*=/i.test(sql))).toBe(true);
  });

  test('renaming an account leaves the session alone', async () => {
    const { app, tx } = makeApp({ id: 1, email: 't@sbcc.church', role: 'admin', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(tx.run.mock.calls.some(([sql]) => /token_version\s*=/i.test(sql))).toBe(false);
  });
});

describe('creating a user without a name', () => {
  // Mirrors the same describe block in api/auth.roles.test.js. The two
  // implementations of this endpoint must agree.
  test('is allowed, and stores an empty name', async () => {
    const { app, db } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', role: 'user' });

    expect(res.status).toBe(200);
    const insert = db.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(['new@sbcc.church', '', 'user', 'actor@sbcc.church']);
  });

  test('a name that is sent is still stored, trimmed', async () => {
    const { app, db } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', name: '  Luz Alipio  ', role: 'user' });

    expect(res.status).toBe(200);
    const insert = db.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert[1]).toContain('Luz Alipio');
  });

  test('an absent email is still refused', async () => {
    const { app } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});
