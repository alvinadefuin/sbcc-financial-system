import React from 'react';
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
jest.mock('./components/LoginNew', () => ({ onLogin }) => <div>Login</div>);
jest.mock('./components/Dashboard', () => ({ user }) => <div>Dashboard for {user?.name}</div>);

test('renders MobileLayout when path is /mobile and user is logged in', async () => {
  window.history.pushState({}, '', '/mobile');
  apiService.getCurrentUser.mockResolvedValue({ id: 1, name: 'Treasurer', role: 'user' });
  localStorage.setItem('authToken', 'tok');

  render(<App />);
  await waitFor(() => expect(screen.getByText(/MobileLayout for Treasurer/)).toBeInTheDocument());

  window.history.pushState({}, '', '/');
  localStorage.removeItem('authToken');
});

test('renders Login when path is /mobile but not logged in', async () => {
  window.history.pushState({}, '', '/mobile');
  apiService.getCurrentUser.mockRejectedValue(new Error('No token'));
  localStorage.removeItem('authToken');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

  window.history.pushState({}, '', '/');
});
