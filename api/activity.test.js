const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./_lib/database', () => mockDb);

const app = require('./activity');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'actor@sbcc.church', role }, JWT_SECRET);

const ENTRY = {
  id: 1,
  occurred_at: '2026-08-15T04:00:00.000Z',
  actor_email: 'admin@sbcc.church',
  actor_role: 'admin',
  action: 'record.update',
  entity_type: 'collection',
  entity_id: 7,
  summary: 'Updated collection 2026-08-15 for 5000.00',
  changes: { particular: { from: 'a', to: 'b' } },
};

// Auth now reads token_version on every request. Route that probe past whatever
// this test wants the handler's own lookup to return.
const getReturns = (row) =>
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : row
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.all.mockResolvedValue([ENTRY]);
  getReturns({ count: '1' });
});

describe('authorization', () => {
  test('super_admin may read the log', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('super_admin'));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('admin may not', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('admin'));
    expect(res.status).toBe(403);
  });

  test('user may not', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('an unauthenticated request is refused', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(401);
  });
});

describe('pagination', () => {
  test('defaults to 50 rows, newest first', async () => {
    await request(app).get('/api/activity').set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/ORDER BY occurred_at DESC/i);
    expect(params).toContain(50);
    expect(params).toContain(0);
  });

  test('honours limit and offset', async () => {
    await request(app)
      .get('/api/activity?limit=10&offset=20')
      .set('Authorization', tokenFor('super_admin'));

    const params = mockDb.all.mock.calls[0][1];
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  test('caps an absurd limit at 200', async () => {
    await request(app)
      .get('/api/activity?limit=100000')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][1]).toContain(200);
  });

  test('ignores a non-numeric limit', async () => {
    await request(app)
      .get('/api/activity?limit=abc')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][1]).toContain(50);
  });
});

describe('filters', () => {
  test('filters by entity', async () => {
    await request(app)
      .get('/api/activity?entity_type=collection&entity_id=7')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/entity_type = \$1/);
    expect(sql).toMatch(/entity_id = \$2/);
    expect(params.slice(0, 2)).toEqual(['collection', 7]);
  });

  test('filters by actor', async () => {
    await request(app)
      .get('/api/activity?actor_email=admin@sbcc.church')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/actor_email = \$1/);
    expect(params[0]).toBe('admin@sbcc.church');
  });

  test('filters by date range, with an exclusive upper bound so `to` includes its whole day', async () => {
    await request(app)
      .get('/api/activity?from=2026-08-01&to=2026-08-31')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/occurred_at >= \$1/);
    expect(sql).toMatch(/occurred_at < \(\$2::date \+ 1\)/);
    expect(params[0]).toBe('2026-08-01');
    expect(params[1]).toBe('2026-08-31');
  });

  test('the count query carries the same filters', async () => {
    await request(app)
      .get('/api/activity?entity_type=expense')
      .set('Authorization', tokenFor('super_admin'));

    // calls[0] is now the auth token_version probe, so find the count query.
    const [sql, params] = mockDb.get.mock.calls.find(([s]) => /COUNT\(\*\)/i.test(s));
    expect(sql).toMatch(/COUNT\(\*\)/i);
    expect(sql).toMatch(/entity_type = \$1/);
    expect(params).toEqual(['expense']);
  });

  test('an unknown query parameter is ignored rather than injected', async () => {
    await request(app)
      .get('/api/activity?order_by=drop+table')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][0]).not.toMatch(/drop/i);
  });
});
