const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = 'your-secret-key-change-this';
const CURRENT = 'current-pass-1';

const USER = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  token_version: 2,
  password_hash: bcrypt.hashSync(CURRENT, 10),
};

const tokenFor = (claims) => 'Bearer ' + jwt.sign(claims, JWT_SECRET);
const MEMBER = tokenFor({ id: 3, email: USER.email, role: 'user', tv: 2 });
const SUPER = tokenFor({ id: 9, email: 'boss@sbcc.church', role: 'super_admin', tv: 2 });
const ADMIN = tokenFor({ id: 8, email: 'adm@sbcc.church', role: 'admin', tv: 2 });

const makeApp = (target = USER) => {
  const tx = {
    run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
    get: jest.fn(async () => null),
    all: jest.fn(async () => []),
  };
  const db = {
    tx,
    get: jest.fn((sql, params, cb) =>
      /token_version FROM users/i.test(sql) ? cb(null, { token_version: 2 }) : cb(null, target)
    ),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
    withTransaction: jest.fn(async (fn) => fn(tx)),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/auth', require('./auth'));
  return { app, db, tx };
};

describe('POST /api/auth/change-password', () => {
  test('rejects an unauthenticated caller', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
  });

  test('rejects a wrong current password', async () => {
    const { app, db } = makeApp();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: 'not-it', new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a new password shorter than 8 characters', async () => {
    const { app, db } = makeApp();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'short7c' });

    expect(res.status).toBe(400);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test('bumps token_version, stores a hash, and returns a replacement token', async () => {
    const { app, tx } = makeApp();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(200);
    const update = tx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);
    expect(update[1].some((p) => typeof p === 'string' && p.startsWith('$2'))).toBe(true);
    expect(JSON.stringify(tx.run.mock.calls)).not.toMatch(/brand-new-pass/);

    // Without this the caller is signed out the moment they succeed.
    expect(jwt.verify(res.body.token, JWT_SECRET).tv).toBe(3);
  });

  test('logs auth.password_change without leaking the password', async () => {
    const { app, tx } = makeApp();
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    const log = tx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));
    expect(log[1][2]).toBe('auth.password_change');
    expect(JSON.stringify(log[1])).not.toMatch(/brand-new-pass|current-pass-1/);
  });
});

describe('PUT /api/auth/users/:id/password', () => {
  test('a super_admin may reset another account', async () => {
    const { app, tx } = makeApp();
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(200);
    const update = tx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);
  });

  test('an admin may not', async () => {
    const { app, db } = makeApp();
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', ADMIN)
      .send({ new_password: 'reset-by-admin' });

    expect(res.status).toBe(403);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a short password', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'short7c' });

    expect(res.status).toBe(400);
  });

  test('404s for a user that does not exist', async () => {
    const { app } = makeApp(null);
    const res = await request(app)
      .put('/api/auth/users/404/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/auth/me honours revocation', () => {
  const meApp = (storedVersion) => {
    const db = {
      get: jest.fn((sql, params, cb) =>
        /token_version FROM users/i.test(sql)
          ? cb(null, { token_version: storedVersion })
          : cb(null, { id: 3, email: USER.email, name: 'Member', role: 'user', is_active: true })
      ),
      all: jest.fn((sql, params, cb) => cb(null, [])),
      run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1 }, null); }),
      withTransaction: jest.fn(async (fn) => fn({ run: jest.fn(async () => ({ changes: 1 })), get: jest.fn(), all: jest.fn() })),
    };
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.db = db; next(); });
    app.use('/api/auth', require('./auth'));
    return app;
  };

  test('a current token reads the profile', async () => {
    const res = await request(meApp(2)).get('/api/auth/me').set('Authorization', MEMBER);
    expect(res.status).toBe(200);
  });

  test('a revoked token is refused with 401', async () => {
    const res = await request(meApp(9)).get('/api/auth/me').set('Authorization', MEMBER);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });
});
