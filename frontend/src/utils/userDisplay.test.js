import { displayName, initialOf } from './userDisplay';

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
