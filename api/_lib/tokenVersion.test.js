const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./database', () => mockDb);

const { assertTokenCurrent } = require('./tokenVersion');

beforeEach(() => {
  jest.clearAllMocks();
});

test('accepts a token whose tv matches the stored version', async () => {
  mockDb.get.mockResolvedValue({ token_version: 3 });
  await expect(assertTokenCurrent({ id: 1, tv: 3 })).resolves.toBe(true);
});

test('rejects a token whose tv is behind the stored version', async () => {
  mockDb.get.mockResolvedValue({ token_version: 4 });
  await expect(assertTokenCurrent({ id: 1, tv: 3 })).resolves.toBe(false);
});

test('treats a token minted before this feature as version zero', async () => {
  // Every token in circulation today has no tv claim. Rejecting them would
  // sign out every user the moment this deploys.
  mockDb.get.mockResolvedValue({ token_version: 0 });
  await expect(assertTokenCurrent({ id: 1 })).resolves.toBe(true);
});

test('rejects a pre-feature token once that user has been bumped', async () => {
  mockDb.get.mockResolvedValue({ token_version: 1 });
  await expect(assertTokenCurrent({ id: 1 })).resolves.toBe(false);
});

test('rejects a token for a user that no longer exists', async () => {
  mockDb.get.mockResolvedValue(null);
  await expect(assertTokenCurrent({ id: 99, tv: 0 })).resolves.toBe(false);
});

test('rejects a token carrying no user id', async () => {
  await expect(assertTokenCurrent({ tv: 0 })).resolves.toBe(false);
  expect(mockDb.get).not.toHaveBeenCalled();
});

test('reads only the one column it needs, by id', async () => {
  mockDb.get.mockResolvedValue({ token_version: 0 });
  await assertTokenCurrent({ id: 7, tv: 0 });

  const [sql, params] = mockDb.get.mock.calls[0];
  expect(sql).toMatch(/SELECT token_version FROM users WHERE id = \$1/i);
  expect(params).toEqual([7]);
});
