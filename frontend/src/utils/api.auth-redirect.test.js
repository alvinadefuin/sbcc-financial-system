// App.js has no router — it picks the phone layout from the path alone
// (`window.location.pathname === '/mobile'`). So a 401 that redirects to
// /login drops a collector on the desktop dashboard, which by design has no way
// to add a record. Revoking a session on a role change makes this fire for
// every collector at once, so the redirect has to keep them where they were.
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

jest.mock('./syncQueue', () => ({ enqueue: jest.fn() }));

const mockAxios = require('axios');

// Re-imports api.js so its constructor registers the interceptor after the
// per-test mock reset, then hands back the rejection handler it registered.
const captureErrorHandler = () => {
  let handler;
  mockAxios.create.mockReturnValue(mockAxios);
  mockAxios.interceptors.response.use.mockImplementation((_onOk, onErr) => {
    handler = onErr;
  });
  jest.isolateModules(() => {
    require('./api');
  });
  return handler;
};

const atPath = (pathname) => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname, href: pathname },
  });
};

const unauthorized = { response: { status: 401 } };

beforeEach(() => {
  localStorage.setItem('authToken', 'test-token');
});

test('a 401 on the phone sends the collector back to /mobile', async () => {
  atPath('/mobile');
  const onError = captureErrorHandler();

  await expect(onError(unauthorized)).rejects.toBe(unauthorized);

  expect(window.location.href).toBe('/mobile');
  expect(localStorage.getItem('authToken')).toBeNull();
});

test('a 401 on desktop still goes to the login screen', async () => {
  atPath('/');
  const onError = captureErrorHandler();

  await expect(onError(unauthorized)).rejects.toBe(unauthorized);

  expect(window.location.href).toBe('/login');
  expect(localStorage.getItem('authToken')).toBeNull();
});

test('a non-401 failure leaves the session and the page alone', async () => {
  atPath('/mobile');
  const onError = captureErrorHandler();
  const serverError = { response: { status: 500 } };

  await expect(onError(serverError)).rejects.toBe(serverError);

  expect(window.location.href).toBe('/mobile');
  expect(localStorage.getItem('authToken')).toBe('test-token');
});
