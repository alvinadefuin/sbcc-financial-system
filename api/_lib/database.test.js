// A fake pg so the transaction mechanics can be tested without a database.
const mockClient = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })), release: jest.fn() };
const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  on: jest.fn(),
};
jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }));

process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
const { withTransaction } = require('./database');

const sqlOf = () => mockClient.query.mock.calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

test('wraps the callback in BEGIN/COMMIT and returns its value', async () => {
  const result = await withTransaction(async (tx) => {
    await tx.run('UPDATE collections SET total_amount = $1 WHERE id = $2', [5, 7]);
    return 'done';
  });

  expect(result).toBe('done');
  expect(sqlOf()).toEqual([
    'BEGIN',
    'UPDATE collections SET total_amount = $1 WHERE id = $2',
    'COMMIT',
  ]);
  expect(mockClient.release).toHaveBeenCalled();
});

test('rolls back and rethrows when the callback throws', async () => {
  await expect(
    withTransaction(async (tx) => {
      await tx.run('UPDATE collections SET total_amount = $1 WHERE id = $2', [5, 7]);
      throw new Error('log write failed');
    })
  ).rejects.toThrow('log write failed');

  expect(sqlOf()).toContain('ROLLBACK');
  expect(sqlOf()).not.toContain('COMMIT');
  expect(mockClient.release).toHaveBeenCalled();
});

test('releases the connection even when COMMIT itself fails', async () => {
  mockClient.query.mockImplementation(async (sql) => {
    if (sql === 'COMMIT') throw new Error('connection lost');
    return { rows: [], rowCount: 0 };
  });

  await expect(withTransaction(async () => {})).rejects.toThrow('connection lost');
  expect(mockClient.release).toHaveBeenCalled();
});

test('tx.run converts ? placeholders and reports affected rows', async () => {
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 3 });

  const res = await withTransaction((tx) => tx.run('DELETE FROM x WHERE a = ? AND b = ?', [1, 2]));

  expect(sqlOf()).toContain('DELETE FROM x WHERE a = $1 AND b = $2');
  expect(res).toEqual({ changes: 3 });
});

test('tx.run appends RETURNING * to inserts so lastID is available', async () => {
  mockClient.query.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });

  const res = await withTransaction((tx) => tx.run('INSERT INTO x (a) VALUES ($1)', [1]));

  expect(sqlOf()).toContain('INSERT INTO x (a) VALUES ($1) RETURNING *');
  expect(res).toEqual({ lastID: 42, changes: 1 });
});

test('tx.get returns the first row and tx.all returns every row', async () => {
  mockClient.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });

  const [one, many] = await withTransaction(async (tx) => [
    await tx.get('SELECT * FROM x'),
    await tx.all('SELECT * FROM x'),
  ]);

  expect(one).toEqual({ id: 1 });
  expect(many).toHaveLength(2);
});
