import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MobileSubmitForm from './MobileSubmitForm';
import apiService from '../../utils/api';

jest.mock('../../utils/api', () => ({
  getCustomFields: jest.fn().mockResolvedValue([
    { field_name: 'general_tithes_offering', field_label: 'General Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  ]),
  submitForMobile: jest.fn(),
}));

const user = { name: 'Admin', email: 'admin@sbcc.church' };

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCustomFields.mockResolvedValue([
    { field_name: 'general_tithes_offering', field_label: 'General Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  ]);
});

test('renders collection form by default', async () => {
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  expect(screen.getByText('Collection')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
});

test('switches to expense form on toggle', async () => {
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Expense')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Expense'));
  await waitFor(() => expect(screen.getByLabelText(/Category/i)).toBeInTheDocument());
});

test('disables submit button while submitting', async () => {
  apiService.submitForMobile.mockImplementation(() => new Promise(() => {})); // never resolves
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  expect(screen.getByRole('button', { name: /Submitting/i })).toBeDisabled();
});

test('calls onSubmitted after successful submission', async () => {
  const onSubmitted = jest.fn();
  apiService.submitForMobile.mockResolvedValue({ status: 'success', data: { id: 1 } });
  render(<MobileSubmitForm user={user} onSubmitted={onSubmitted} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
});

test('shows duplicate conflict dialog on 409', async () => {
  apiService.submitForMobile.mockResolvedValue({
    status: 'duplicate',
    conflict: { submitted_by: 'bob@sbcc.church', date: '2026-05-26', total_amount: 5000 },
  });
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  await waitFor(() => expect(screen.getByText(/already submitted by/i)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Submit Anyway/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
});

test('pre-fills date when prefill prop is provided', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  // Wait for loadFields to complete (field label appears), THEN check prefill values
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-05-25');
});

test('pre-fills payment method when prefill prop is provided', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/Payment/i)).toHaveValue('GCash');
});

test('shows prefill info banner and dismisses it on close', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  await waitFor(() => expect(screen.getByText(/Adding GCash/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByText(/Adding GCash/i)).not.toBeInTheDocument();
});

test('clears prefill banner when type is toggled', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} prefill={prefill} onPrefillConsumed={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/Adding GCash/i)).toBeInTheDocument());
  fireEvent.click(screen.getByText('Expense'));
  expect(screen.queryByText(/Adding GCash/i)).not.toBeInTheDocument();
});

test('calls onPrefillConsumed after applying prefill', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  const onPrefillConsumed = jest.fn();
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} prefill={prefill} onPrefillConsumed={onPrefillConsumed} />);
  // Wait for loadFields to complete
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
  expect(onPrefillConsumed).toHaveBeenCalledTimes(1);
});

const MULTI_FIELDS = [
  { field_name: 'general_tithes_offering', field_label: 'General Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
];

const renderWithFields = async (props = {}) => {
  apiService.getCustomFields.mockResolvedValue(MULTI_FIELDS);
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} {...props} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
};

const selectGcash = () =>
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'GCash' } });

test('GCash leaves only General Tithes & Offering enabled', async () => {
  await renderWithFields();
  selectGcash();
  expect(screen.getByLabelText(/General Tithes/i)).toBeEnabled();
  expect(screen.getByLabelText(/Sunday School/i)).toBeDisabled();
});

test('GCash clears amounts already typed into other fields', async () => {
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Sunday School/i), { target: { value: '166' } });
  selectGcash();
  expect(screen.getByLabelText(/Sunday School/i)).toHaveValue('');
});

test('the submitted payload carries no stale amounts after switching to GCash', async () => {
  apiService.submitForMobile.mockResolvedValue({ status: 'success', data: { id: 1 } });
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-08-02' } });
  fireEvent.change(screen.getByLabelText(/Sunday School/i), { target: { value: '166' } });
  selectGcash();
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '2000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

  await waitFor(() => expect(apiService.submitForMobile).toHaveBeenCalled());
  const payload = apiService.submitForMobile.mock.calls[0][1];
  expect(payload.sunday_school).toBe('');
  expect(payload.general_tithes_offering).toBe('2000');
  expect(payload.payment_method).toBe('GCash');
});

test('switching back to Cash re-enables every field', async () => {
  await renderWithFields();
  selectGcash();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Cash' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
});

test('Check and Bank Transfer leave every field enabled', async () => {
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Check' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Bank Transfer' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
});

test('the denomination calculator is hidden on disabled fields', async () => {
  await renderWithFields();
  expect(screen.getAllByTitle(/denomination calculator/i)).toHaveLength(2);
  selectGcash();
  expect(screen.getAllByTitle(/denomination calculator/i)).toHaveLength(1);
});

test('explains why the fields are locked', async () => {
  await renderWithFields();
  selectGcash();
  expect(screen.getByText(/GCash entries are recorded as Tithes & Offering/i)).toBeInTheDocument();
});

test('the Add GCash prefill arrives already restricted', async () => {
  await renderWithFields({ prefill: { date: '2026-08-02', payment_method: 'GCash' }, onPrefillConsumed: jest.fn() });
  await waitFor(() => expect(screen.getByLabelText(/Sunday School/i)).toBeDisabled());
});
