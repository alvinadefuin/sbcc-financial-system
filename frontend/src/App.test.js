import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import apiService from './utils/api';

jest.mock('./utils/api', () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('./components/mobile/MobileLayout', () => ({ user }) => (
  <div>MobileLayout for {user?.name}</div>
));
jest.mock('./components/Login', () => ({ onLogin }) => <div>Login</div>);
jest.mock('./components/Dashboard', () => ({ user }) => <div>Dashboard for {user?.name}</div>);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.removeItem('authToken');
  window.history.pushState({}, '', '/');
});

test('renders login when not authenticated', async () => {
  apiService.getCurrentUser.mockRejectedValue(new Error('No token'));
  render(<App />);
  await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());
});

test('renders Dashboard when authenticated and path is /', async () => {
  localStorage.setItem('authToken', 'tok');
  apiService.getCurrentUser.mockResolvedValue({ id: 1, name: 'Admin', role: 'admin' });
  render(<App />);
  await waitFor(() => expect(screen.getByText(/Dashboard for Admin/)).toBeInTheDocument());
  localStorage.removeItem('authToken');
});
