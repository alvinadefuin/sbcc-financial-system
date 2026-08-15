import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getGoogleConfig: jest.fn(),
  login: jest.fn(),
  loginWithGoogle: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getGoogleConfig.mockResolvedValue({ configured: false, clientId: null });
});

async function renderPasswordTab() {
  render(<Login onLogin={jest.fn()} />);
  await waitFor(() => expect(apiService.getGoogleConfig).toHaveBeenCalled());
  await userEvent.click(screen.getByRole('button', { name: /password/i }));
}

test('does not display default credentials on the login screen', async () => {
  await renderPasswordTab();

  expect(screen.queryByText(/admin123/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/admin@sbcc\.church/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^default:/i)).not.toBeInTheDocument();
});

test('email and password fields start empty', async () => {
  await renderPasswordTab();

  expect(screen.getByPlaceholderText('you@sbcc.church')).toHaveValue('');
  expect(screen.getByPlaceholderText('••••••••')).toHaveValue('');
});
