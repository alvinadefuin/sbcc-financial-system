import { syncPendingEntries, startSyncListener } from './syncManager';

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

jest.mock('./syncQueue', () => ({
  getPending: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
}));

const axios = require('axios');
const { getPending: mockGetPending, updateStatus: mockUpdateStatus, remove: mockRemove } = require('./syncQueue');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('authToken', 'test-token');
});

test('syncPendingEntries calls POST for each pending entry and removes on success', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-1', type: 'collection', data: { date: '2026-05-26' } },
  ]);
  axios.post.mockResolvedValue({ data: { id: 42 } });

  await syncPendingEntries();

  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/collections'),
    expect.objectContaining({ date: '2026-05-26' }),
    expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
  );
  expect(mockRemove).toHaveBeenCalledWith('id-1');
});

test('syncPendingEntries marks entry as failed on network error', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-2', type: 'expense', data: { date: '2026-05-26' } },
  ]);
  axios.post.mockRejectedValue(new Error('Network Error'));

  await syncPendingEntries();

  expect(mockUpdateStatus).toHaveBeenCalledWith('id-2', 'failed', 'Network Error');
});

test('syncPendingEntries marks entry as duplicate on 409', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-3', type: 'collection', data: { date: '2026-05-26' } },
  ]);
  const err = new Error('Conflict');
  err.response = { status: 409, data: { conflict: { submitted_by: 'admin', date: '2026-05-26' } } };
  axios.post.mockRejectedValue(err);

  await syncPendingEntries();

  expect(mockUpdateStatus).toHaveBeenCalledWith('id-3', 'duplicate', JSON.stringify({ submitted_by: 'admin', date: '2026-05-26' }));
});

test('startSyncListener returns a cleanup function', () => {
  const cleanup = startSyncListener(jest.fn());
  expect(typeof cleanup).toBe('function');
  cleanup();
});
