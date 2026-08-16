import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MobileRecentList from './MobileRecentList';
import apiService from '../../utils/api';
import * as syncQueue from '../../utils/syncQueue';
import * as syncManager from '../../utils/syncManager';

jest.mock('../../utils/api', () => ({ getRecentEntries: jest.fn() }));
jest.mock('../../utils/syncQueue', () => ({ getAll: jest.fn() }));
jest.mock('../../utils/syncManager', () => ({ syncPendingEntries: jest.fn() }));

const mockEntries = [
  { id: 1, date: '2026-05-26', total_amount: 5000, created_by: 'admin@sbcc.church', entryType: 'collection', payment_method: 'Cash' },
  { id: 2, date: '2026-05-25', total_amount: 1500, created_by: 'admin@sbcc.church', entryType: 'expense' },
];

const mockQueued = [
  { localId: 'q1', type: 'collection', status: 'pending', data: { date: '2026-05-26', general_tithes_offering: '2000' }, queuedAt: new Date().toISOString() },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getRecentEntries.mockResolvedValue(mockEntries);
  syncQueue.getAll.mockResolvedValue([]);
});

test('renders recent entries from API', async () => {
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  expect(screen.getByText(/₱1,500/)).toBeInTheDocument();
});

test('shows pending badge for queued entries', async () => {
  syncQueue.getAll.mockResolvedValue(mockQueued);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());
});

test('shows failed badge with retry button', async () => {
  syncQueue.getAll.mockResolvedValue([
    { ...mockQueued[0], status: 'failed', error: 'Network Error' },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('failed')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
});

test('shows duplicate badge with Submit Anyway and Cancel', async () => {
  syncQueue.getAll.mockResolvedValue([
    { ...mockQueued[0], status: 'duplicate', error: JSON.stringify({ submitted_by: 'bob', date: '2026-05-26' }) },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('duplicate')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Submit Anyway/i })).toBeInTheDocument();
});

test('a synced card shows a readable date and submission time', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    {
      id: 1, date: '2026-08-16', total_amount: 5000, created_by: 'nerio@sbcc.church',
      entryType: 'collection', payment_method: 'Cash',
      created_at: '2026-08-16T04:41:33.270Z',
    },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  // Asserted loosely on the time so the suite does not depend on the runner's zone.
  expect(screen.getByText(/Aug 16, 2026 ·/)).toBeInTheDocument();
  expect(screen.queryByText(/2026-08-16T/)).not.toBeInTheDocument();
});

test('the Newest/Oldest toggle reverses the synced list', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    { id: 1, date: '2026-08-16', total_amount: 111, created_by: 'a@b.c', entryType: 'collection', created_at: '2026-08-16T04:41:00.000Z' },
    { id: 2, date: '2026-08-16', total_amount: 222, created_by: 'a@b.c', entryType: 'collection', created_at: '2026-08-16T04:50:00.000Z' },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱222/)).toBeInTheDocument());

  const amountsInOrder = () =>
    screen.getAllByText(/₱\d/).map((n) => n.textContent);

  expect(amountsInOrder()[0]).toMatch(/222/);

  fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));

  expect(screen.getByRole('button', { name: /sort by date/i })).toHaveTextContent('Oldest');
  expect(amountsInOrder()[0]).toMatch(/111/);
});

test('history is read-only — no supplement button on a Cash collection card', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    { id: 1, date: '2026-08-16', total_amount: 5000, created_by: 'a@b.c', entryType: 'collection', payment_method: 'Cash', created_at: '2026-08-16T04:41:00.000Z' },
  ]);
  // Deliberately still passes the retired prop. Asserting on a render without
  // it would pass even with the old button in place, since the button was
  // guarded on the callback being present.
  render(<MobileRecentList onQueueChange={jest.fn()} onAddSupplement={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Add GCash/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add Cash/i })).not.toBeInTheDocument();
});
