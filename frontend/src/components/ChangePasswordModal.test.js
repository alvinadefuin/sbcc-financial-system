import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePasswordModal from './ChangePasswordModal';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  changePassword: jest.fn(),
}));

// CRA sets resetMocks: true, so implementations belong here, not in the factory.
beforeEach(() => {
  apiService.changePassword.mockResolvedValue({ message: 'Password changed successfully', token: 'new-token' });
});

const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const renderModal = (props = {}) =>
  render(<ChangePasswordModal onClose={() => {}} {...props} />);

test('refuses a new password shorter than 8 characters without calling the API', async () => {
  renderModal();

  fill(/current password/i, 'whatever1');
  fill(/^new password/i, 'short7c');
  fill(/confirm/i, 'short7c');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument());
  expect(apiService.changePassword).not.toHaveBeenCalled();
});

test('refuses a mismatched confirmation without calling the API', async () => {
  renderModal();

  fill(/current password/i, 'whatever1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pazz');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
  expect(apiService.changePassword).not.toHaveBeenCalled();
});

test('submits both passwords when the form is valid', async () => {
  renderModal();

  fill(/current password/i, 'current-pass-1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() =>
    expect(apiService.changePassword).toHaveBeenCalledWith('current-pass-1', 'brand-new-pass')
  );
});

test('reports a rejected current password from the server', async () => {
  apiService.changePassword.mockRejectedValue({
    response: { status: 401, data: { error: 'Current password is incorrect' } },
  });
  renderModal();

  fill(/current password/i, 'wrong-one-here');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument());
});

test('tells the user other devices were signed out, then closes', async () => {
  const onClose = jest.fn();
  renderModal({ onClose });

  fill(/current password/i, 'current-pass-1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/other devices/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /done/i }));
  expect(onClose).toHaveBeenCalled();
});
