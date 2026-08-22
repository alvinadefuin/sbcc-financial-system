// The budget write replaces every budget_categories row for a year. It was
// reachable by any signed-in account, while every other financial mutation in
// this codebase is admin-only — a collector who cannot edit one expense could
// overwrite the whole plan. Reads stay open: the Expenses tab needs them.
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./_lib/database', () => ({
  // Auth reads token_version on every request; anything else answers null.
  get: jest.fn(async (sql) => (/SELECT token_version/i.test(sql) ? { token_version: 0 } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ rowCount: 1, lastID: 1 })),
}));

const app = require('./budget');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

const planBody = { year: 2026, target_offering: 109916.67, categories: [] };

describe('budget role gates', () => {
  test('a user may not write the budget plan', async () => {
    const res = await request(app)
      .post('/api/budget/plan')
      .set('Authorization', tokenFor('user'))
      .send(planBody);
    expect(res.status).toBe(403);
  });

  test('an admin may write the budget plan', async () => {
    const res = await request(app)
      .post('/api/budget/plan')
      .set('Authorization', tokenFor('admin'))
      .send(planBody);
    expect(res.status).not.toBe(403);
  });

  test('a super_admin may write the budget plan', async () => {
    const res = await request(app)
      .post('/api/budget/plan')
      .set('Authorization', tokenFor('super_admin'))
      .send(planBody);
    expect(res.status).not.toBe(403);
  });

  test('an unauthenticated write is rejected', async () => {
    const res = await request(app).post('/api/budget/plan').send(planBody);
    expect([401, 403]).toContain(res.status);
  });

  // The Expenses tab reads the budget for every role, so the gate must not
  // spread to the GETs.
  test('a user may still read the plan, the comparison and availability', async () => {
    for (const path of [
      '/api/budget/plan/2026',
      '/api/budget/comparison/2026',
      '/api/budget/available/2026/Operational%20Fund',
    ]) {
      const res = await request(app).get(path).set('Authorization', tokenFor('user'));
      expect(res.status).not.toBe(403);
    }
  });
});
