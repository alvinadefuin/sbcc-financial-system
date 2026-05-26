import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MobileRecentList from './MobileRecentList';
import apiService from '../../utils/api';
import * as syncQueue from '../../utils/syncQueue';
import * as syncManager from '../../utils/syncManager';

jest.mock('../../utils/api', () => ({ getRecentEntries: jest.fn() }));
jest.mock('../../utils/syncQueue', () => ({ getAll: jest.fn() }));
jest.mock('../../utils/syncManager', () => ({ syncPendingEntries: jest.fn() }));

const mockEntries = [
  { id: 1, date: '2026-05-26', total_amount: 5000, created_by: 'admin@sbcc.church', entryType: 'collection' },
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
