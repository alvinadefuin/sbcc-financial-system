import { displayName, initialOf, sortUsers } from './userDisplay';

describe('displayName', () => {
  test('uses the stored name when there is one', () => {
    expect(displayName({ name: 'Nerio Brazil', email: 'nerioybrazil@gmail.com' })).toBe('Nerio Brazil');
  });

  test("falls back to the email's local part for an account that never signed in", () => {
    expect(displayName({ name: '', email: 'policarpiomasocorro@gmail.com' })).toBe('policarpiomasocorro');
  });

  // The column is TEXT NOT NULL today, so a nameless account stores ''. Testing
  // truthiness rather than `!== null` keeps this correct if it is ever relaxed.
  test('treats null the same as empty', () => {
    expect(displayName({ name: null, email: 'luzalipio8@gmail.com' })).toBe('luzalipio8');
  });

  test('treats a whitespace-only name as no name', () => {
    expect(displayName({ name: '   ', email: 'rudycambel11@gmail.com' })).toBe('rudycambel11');
  });

  test('trims a stored name', () => {
    expect(displayName({ name: '  Luz Alipio  ', email: 'l@x.com' })).toBe('Luz Alipio');
  });

  test('falls back to the whole string when the email has no @', () => {
    expect(displayName({ name: '', email: 'admin' })).toBe('admin');
  });

  test('never returns an empty label', () => {
    expect(displayName({ name: '', email: '' })).toBe('Unknown');
    expect(displayName(undefined)).toBe('Unknown');
  });
});

describe('initialOf', () => {
  test('uppercases the first letter of the display name', () => {
    expect(initialOf({ name: 'nerio brazil', email: 'n@x.com' })).toBe('N');
  });

  test('agrees with displayName when the name is missing', () => {
    const user = { name: '', email: 'policarpiomasocorro@gmail.com' };
    expect(initialOf(user)).toBe(displayName(user).charAt(0).toUpperCase());
    expect(initialOf(user)).toBe('P');
  });

  test('does not throw on a user with neither name nor email', () => {
    expect(initialOf({})).toBe('U');
  });
});

describe('sortUsers', () => {
  const USERS = [
    { id: 1, name: 'Alvin Adefuin', email: 'adefuin29@gmail.com', role: 'user',
      last_login: '2026-08-16T01:00:00Z', created_at: '2026-08-16T00:00:00Z' },
    { id: 2, name: 'Church Super Administrator', email: 'admin@sbcc.church', role: 'super_admin',
      last_login: '2026-08-16T02:00:00Z', created_at: '2025-12-14T00:00:00Z' },
    { id: 3, name: 'Test Member', email: 'member@sbcc.church', role: 'user',
      last_login: null, created_at: '2025-12-14T01:00:00Z' },
    { id: 4, name: 'Luz Alipio', email: 'luzalipio8@gmail.com', role: 'admin',
      last_login: '2026-08-16T03:00:00Z', created_at: '2026-08-16T01:00:00Z' },
  ];

  const ids = (rows) => rows.map((r) => r.id);

  test('defaults to newest created first, matching the server order', () => {
    expect(ids(sortUsers(USERS))).toEqual([4, 1, 3, 2]);
  });

  test('created ascending is the exact reverse', () => {
    expect(ids(sortUsers(USERS, { key: 'created', direction: 'asc' }))).toEqual([2, 3, 1, 4]);
  });

  test('sorts by display name', () => {
    expect(ids(sortUsers(USERS, { key: 'name', direction: 'asc' }))).toEqual([1, 2, 4, 3]);
    expect(ids(sortUsers(USERS, { key: 'name', direction: 'desc' }))).toEqual([3, 4, 2, 1]);
  });

  test('a nameless account sorts under its email fallback, not last', () => {
    const rows = [
      { id: 1, name: 'Zeny Cruz', email: 'z@x.com', role: 'user' },
      { id: 2, name: '', email: 'bello@x.com', role: 'user' },
    ];
    expect(ids(sortUsers(rows, { key: 'name', direction: 'asc' }))).toEqual([2, 1]);
  });

  // Alphabetical order would interleave admin and super_admin around user,
  // which is not what "sort by role" means to anyone reading the table.
  test('sorts roles by rank, not alphabetically', () => {
    const roles = sortUsers(USERS, { key: 'role', direction: 'desc' }).map((r) => r.role);
    expect(roles).toEqual(['super_admin', 'admin', 'user', 'user']);
  });

  test('ties within a role break on display name, ascending, in both directions', () => {
    expect(ids(sortUsers(USERS, { key: 'role', direction: 'desc' }))).toEqual([2, 4, 1, 3]);
    expect(ids(sortUsers(USERS, { key: 'role', direction: 'asc' }))).toEqual([1, 3, 4, 2]);
  });

  test('a never-signed-in account sorts last in both directions', () => {
    expect(ids(sortUsers(USERS, { key: 'last_login', direction: 'desc' }))).toEqual([4, 2, 1, 3]);
    expect(ids(sortUsers(USERS, { key: 'last_login', direction: 'asc' }))).toEqual([1, 2, 4, 3]);
  });

  test('is pure — the input array is untouched', () => {
    const input = [...USERS];
    sortUsers(input, { key: 'name', direction: 'asc' });
    expect(ids(input)).toEqual([1, 2, 3, 4]);
  });

  test('tolerates no input', () => {
    expect(sortUsers(undefined)).toEqual([]);
  });
});
