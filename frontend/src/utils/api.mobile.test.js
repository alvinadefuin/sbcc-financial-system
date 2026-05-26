import apiService from './api';

jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(() => mockAxios),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    post: jest.fn(),
    get: jest.fn(),
  };
  return mockAxios;
});

jest.mock('./syncQueue', () => ({
  enqueue: jest.fn(),
}));

const mockAxios = require('axios');
const { enqueue: mockEnqueue } = require('./syncQueue');

beforeEach(() => {
  jest.clearAllMocks();
  mockEnqueue.mockResolvedValue({ localId: 'queued-123', status: 'pending' });
  localStorage.setItem('authToken', 'test-token');
});

test('loginPwa calls POST with pwa:true and stores token', async () => {
  mockAxios.post.mockResolvedValue({ data: { token: 'tok123', user: { id: 1, name: 'Admin' } } });
  await apiService.loginPwa('admin@sbcc.church', 'admin123');
  expect(mockAxios.post).toHaveBeenCalledWith(
    '/api/auth/login',
    { email: 'admin@sbcc.church', password: 'admin123', pwa: true }
  );
  expect(localStorage.getItem('authToken')).toBe('tok123');
});

test('submitForMobile returns success when online', async () => {
  mockAxios.post.mockResolvedValue({ data: { id: 5 } });
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('success');
  expect(result.data.id).toBe(5);
});

test('submitForMobile queues entry when offline (no response)', async () => {
  const networkErr = new Error('Network Error');
  mockAxios.post.mockRejectedValue(networkErr);
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('queued');
  expect(result.localId).toBe('queued-123');
});

test('submitForMobile returns duplicate status on 409', async () => {
  const err = new Error('Conflict');
  err.response = { status: 409, data: { conflict: { submitted_by: 'bob', date: '2026-05-26' } } };
  mockAxios.post.mockRejectedValue(err);
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('duplicate');
  expect(result.conflict.submitted_by).toBe('bob');
});
