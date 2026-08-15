import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MobileLayout from './MobileLayout';
import apiService from '../../utils/api';
import * as syncQueue from '../../utils/syncQueue';

jest.mock('../../utils/api', () => ({
  getCustomFields: jest.fn(),
  submitForMobile: jest.fn(),
  getRecentEntries: jest.fn(),
}));
jest.mock('../../utils/syncQueue', () => ({ getAll: jest.fn() }));
jest.mock('../../utils/syncManager', () => ({ syncPendingEntries: jest.fn() }));

const user = { name: 'Collector', email: 'collector@sbcc.church' };

const FIELDS = [
  {
    field_name: 'general_tithes_offering',
    field_label: 'General Tithes & Offering',
    field_type: 'decimal',
    display_order: 0,
    is_active: 1,
  },
];

// resetMocks is on for this project, so return values belong here, not in the
// jest.mock factory above.
beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCustomFields.mockResolvedValue(FIELDS);
  apiService.getRecentEntries.mockResolvedValue([]);
  syncQueue.getAll.mockResolvedValue([]);
});

test('keeps the guide hidden until the Help button is pressed', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  expect(screen.queryByText('How to use this app')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));

  expect(screen.getByText('How to use this app')).toBeInTheDocument();
});

test('hides the guide again when it is closed', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));
  fireEvent.click(screen.getByRole('button', { name: /Close/i }));

  expect(screen.queryByText('How to use this app')).not.toBeInTheDocument();
});

// Scoped to the tab bar on purpose: MobileSubmitForm has its own type="submit"
// button, so an unscoped getByRole(/Submit/i) matches two elements and throws.
test('leaves the tab bar at two tabs', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  const tabBar = screen.getByTestId('mobile-tab-bar');

  expect(within(tabBar).getAllByRole('button')).toHaveLength(2);
  expect(within(tabBar).getByText('Submit')).toBeInTheDocument();
  expect(within(tabBar).getByText('Recent')).toBeInTheDocument();
  expect(within(tabBar).queryByText('Help')).not.toBeInTheDocument();
});

// This is the reason the guide is an overlay and not a third tab. A tab switch
// unmounts MobileSubmitForm and wipes a half-filled collection form.
test('a half-filled form survives opening and closing the guide', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  expect(screen.getByLabelText(/General Tithes/i)).toHaveValue('5000');

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));
  fireEvent.click(screen.getByRole('button', { name: /Close/i }));

  expect(screen.getByLabelText(/General Tithes/i)).toHaveValue('5000');
});
