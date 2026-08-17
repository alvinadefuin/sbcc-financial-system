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

// CRA's jest config sets resetMocks: true, so return values belong here.
beforeEach(() => {
  apiService.getCollections.mockResolvedValue([]);
  apiService.getExpenses.mockResolvedValue([]);
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  apiService.healthCheck.mockResolvedValue({ status: 'OK' });
});

// An account created without a name can be given a password by a super admin
// and sign in without Google ever filling one. The shell used to render that
// person as a blank avatar circle and a bare "Welcome back,".
test('a signed-in user with no stored name is labelled by their email', async () => {
  render(
    <Dashboard
      user={{ id: 1, email: 'policarpiomasocorro@gmail.com', name: '', role: 'user' }}
      onLogout={() => {}}
    />
  );

  await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());
  expect(screen.getAllByText('policarpiomasocorro').length).toBeGreaterThan(0);
  expect(screen.getByText('P')).toBeInTheDocument();
});

test('a user with a stored name still shows it', async () => {
  render(
    <Dashboard
      user={{ id: 1, email: 'l@x.com', name: 'Luz Alipio', role: 'admin' }}
      onLogout={() => {}}
    />
  );

  await waitFor(() => expect(screen.getAllByText('Luz Alipio').length).toBeGreaterThan(0));
});
