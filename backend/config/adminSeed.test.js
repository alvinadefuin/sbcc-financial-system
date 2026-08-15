const { resolveAdminCredentials, DEFAULT_ADMIN_EMAIL } = require('./adminSeed');

describe('resolveAdminCredentials()', () => {
  it('uses ADMIN_EMAIL and ADMIN_PASSWORD when both are set', () => {
    const result = resolveAdminCredentials({
      ADMIN_EMAIL: 'treasurer@yourchurch.org',
      ADMIN_PASSWORD: 'a-strong-passphrase',
    });

    expect(result.email).toBe('treasurer@yourchurch.org');
    expect(result.password).toBe('a-strong-passphrase');
    expect(result.generated).toBe(false);
  });

  it('falls back to the default email when ADMIN_EMAIL is not set', () => {
    const result = resolveAdminCredentials({ ADMIN_PASSWORD: 'a-strong-passphrase' });

    expect(result.email).toBe(DEFAULT_ADMIN_EMAIL);
  });

  it('generates a random password when ADMIN_PASSWORD is not set', () => {
    const result = resolveAdminCredentials({});

    expect(result.generated).toBe(true);
    expect(result.password.length).toBeGreaterThanOrEqual(16);
    expect(result.password).not.toBe('admin123');
  });

  it('treats an empty ADMIN_PASSWORD as unset rather than using it', () => {
    const result = resolveAdminCredentials({ ADMIN_PASSWORD: '' });

    expect(result.generated).toBe(true);
    expect(result.password).not.toBe('');
  });

  it('generates a different password on each call', () => {
    const first = resolveAdminCredentials({});
    const second = resolveAdminCredentials({});

    expect(first.password).not.toBe(second.password);
  });
});
