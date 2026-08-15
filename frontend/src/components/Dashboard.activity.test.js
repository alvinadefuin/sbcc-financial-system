import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getCollections: jest.fn(),
  getExpenses: jest.fn(),
  getActivity: jest.fn(),
  healthCheck: jest.fn(),
}));

// CRA's jest config sets resetMocks: true, which strips any implementation
// declared in the factory above — so the return values belong here.
beforeEach(() => {
  apiService.getCollections.mockResolvedValue([]);
  apiService.getExpenses.mockResolvedValue([]);
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  apiService.healthCheck.mockResolvedValue({ status: 'OK' });
});

const renderAs = (role) =>
  render(<Dashboard user={{ id: 1, email: 'a@b.c', name: 'A', role }} onLogout={() => {}} />);

test('a super admin sees the Activity nav item', async () => {
  renderAs('super_admin');
  await waitFor(() => expect(screen.getByText('Activity Log')).toBeInTheDocument());
});

test('an admin does not', async () => {
  renderAs('admin');
  await waitFor(() => expect(screen.getByText('Users')).toBeInTheDocument());
  expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
});

test('a plain user does not', async () => {
  renderAs('user');
  // "Reports" is a nav item every role sees, and unlike "Dashboard" it is not
  // also the page heading — so it matches exactly once.
  await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());
  expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
});
