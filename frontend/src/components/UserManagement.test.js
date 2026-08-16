import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import UserManagement from './UserManagement';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getUsers: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}));

const SUPER = { id: 9, email: 'boss@sbcc.church', name: 'Boss', role: 'super_admin' };

const USERS = [
  { id: 1, name: 'Alvin Adefuin', email: 'adefuin29@gmail.com', role: 'user', is_active: true,
    last_login: '2026-08-16T01:00:00Z', created_at: '2026-08-16T00:00:00Z' },
  { id: 2, name: 'Church Super Administrator', email: 'admin@sbcc.church', role: 'super_admin', is_active: true,
    last_login: '2026-08-16T02:00:00Z', created_at: '2025-12-14T00:00:00Z' },
  { id: 3, name: '', email: 'policarpiomasocorro@gmail.com', role: 'user', is_active: true,
    last_login: null, created_at: '2025-12-14T01:00:00Z' },
  { id: 4, name: 'Luz Alipio', email: 'luzalipio8@gmail.com', role: 'admin', is_active: true,
    last_login: '2026-08-16T03:00:00Z', created_at: '2026-08-16T01:00:00Z' },
];

// CRA sets resetMocks: true, which strips implementations declared in the
// jest.mock factory above — so the return values belong here.
beforeEach(() => {
  jest.clearAllMocks();
  apiService.getUsers.mockResolvedValue(USERS);
  apiService.createUser.mockResolvedValue({ id: 5 });
  apiService.updateUser.mockResolvedValue({});
  apiService.deleteUser.mockResolvedValue({});
});

// `findByText` rather than `getByText`: the list arrives from an async
// getUsers(), so every test has to wait for the first paint. Exported shape is
// used by every later describe block in this file.
const rowFor = async (label) => (await screen.findByText(label)).closest('tr');

test('an account that has never signed in is labelled by its email', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('policarpiomasocorro@gmail.com')).toBeInTheDocument();
});

test('the avatar letter comes from the same fallback as the label', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('P')).toBeInTheDocument();
});

test('accounts with a stored name still show it', async () => {
  render(<UserManagement user={SUPER} />);

  expect(await screen.findByText('Luz Alipio')).toBeInTheDocument();
});

test('the delete confirmation names the account the same way the row does', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  fireEvent.click(within(row).getByTitle('Delete user'));

  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('policarpiomasocorro'));
  confirm.mockRestore();
});
