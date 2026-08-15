import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActivityLogView from './ActivityLogView';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getActivity: jest.fn(),
}));

const ENTRIES = [
  {
    id: 2,
    occurred_at: '2026-08-15T04:10:00.000Z',
    actor_email: 'admin@sbcc.church',
    actor_role: 'admin',
    action: 'record.update',
    entity_type: 'collection',
    entity_id: 7,
    summary: 'Updated collection 2026-08-15 for 5000.00',
    changes: { particular: { from: 'Sunday Service', to: 'Sunday Worship' } },
  },
  {
    id: 1,
    occurred_at: '2026-08-15T04:00:00.000Z',
    actor_email: 'boss@sbcc.church',
    actor_role: 'super_admin',
    action: 'auth.login_success',
    entity_type: null,
    entity_id: null,
    summary: 'Signed in',
    changes: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getActivity.mockResolvedValue({ entries: ENTRIES, total: 2, limit: 50, offset: 0 });
});

test('lists each entry with its actor and summary', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Updated collection/)).toBeInTheDocument());
  expect(screen.getByText('admin@sbcc.church')).toBeInTheDocument();
  expect(screen.getByText(/Signed in/)).toBeInTheDocument();
});

test('shows a readable label instead of the raw action key', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText('Record updated')).toBeInTheDocument());
  expect(screen.getByText('Signed in')).toBeInTheDocument();
  expect(screen.queryByText('record.update')).not.toBeInTheDocument();
});

test('hides the diff until the entry is expanded', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Updated collection/)).toBeInTheDocument());
  expect(screen.queryByText('Sunday Worship')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /details for entry 2/i }));

  expect(screen.getByText(/Sunday Service/)).toBeInTheDocument();
  expect(screen.getByText(/Sunday Worship/)).toBeInTheDocument();
});

test('offers no expander for an entry with no diff', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Signed in/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /details for entry 1/i })).not.toBeInTheDocument();
});

test('filters by entity type', async () => {
  render(<ActivityLogView />);
  await waitFor(() => expect(apiService.getActivity).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'collection' } });

  await waitFor(() =>
    expect(apiService.getActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ entity_type: 'collection', offset: 0 })
    )
  );
});

test('pages forward and back', async () => {
  apiService.getActivity.mockResolvedValue({ entries: ENTRIES, total: 120, limit: 50, offset: 0 });
  render(<ActivityLogView />);
  await waitFor(() => expect(apiService.getActivity).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await waitFor(() =>
    expect(apiService.getActivity).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }))
  );
});

test('says so when there is nothing to show', async () => {
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/no activity/i)).toBeInTheDocument());
});

test('surfaces a failure instead of rendering an empty list', async () => {
  apiService.getActivity.mockRejectedValue(new Error('boom'));
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/could not load/i)).toBeInTheDocument());
});
