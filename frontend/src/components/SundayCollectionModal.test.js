import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SundayCollectionModal from './SundayCollectionModal';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { getCollections: jest.fn(), getCustomFields: jest.fn() },
}));

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
];

const RECORDS = [
  { id: 1, date: '2026-08-02', payment_method: 'Cash', total_amount: 18266, general_tithes_offering: 18100, sunday_school: 166, custom_fields: {} },
  { id: 2, date: '2026-08-02', payment_method: 'GCash', total_amount: 2000, general_tithes_offering: 2000, sunday_school: 0, custom_fields: {} },
  { id: 3, date: '2026-08-09', payment_method: 'Cash', total_amount: 500, general_tithes_offering: 500, sunday_school: 0, custom_fields: {} },
];

let writeText;

beforeEach(() => {
  // resetMocks is on: return values must be set here, not in the factory.
  apiService.getCustomFields.mockResolvedValue(FIELD_DEFS);
  apiService.getCollections.mockResolvedValue(RECORDS);
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10));
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  jest.useRealTimers();
});

const openModal = async () => {
  render(<SundayCollectionModal isOpen onClose={jest.fn()} />);
  await waitFor(() => expect(apiService.getCollections).toHaveBeenCalled());
};

test('renders nothing when closed', () => {
  const { container } = render(<SundayCollectionModal isOpen={false} onClose={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
  expect(apiService.getCollections).not.toHaveBeenCalled();
});

test('fetches the current month', async () => {
  await openModal();
  expect(apiService.getCollections).toHaveBeenCalledWith({ month: '08', year: '2026' });
});

test('preselects the latest date with records and renders its message', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  expect(box.value).toContain('Date : AUGUST 09, 2026');
  expect(box.value).toContain('Tithes & Offering - Php 500.00');
});

test('selecting a date rebuilds the message', async () => {
  await openModal();
  // Wait for the fetch to land first: until it does the calendar renders every
  // date disabled, and clicking a disabled day does nothing.
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  expect(box.value).toContain('Tithes & Offering - Php 18,100.00');
  expect(box.value).toContain('Sunday School - Php 166.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
  expect(box.value).toContain('Total Collection: Php 20,266.00');
});

test('copies the current contents of the box, including manual edits', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.change(box, { target: { value: 'Edited by hand\n\nAttendance: Adult- 128' } });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('Edited by hand\n\nAttendance: Adult- 128'));
});

test('confirms the copy', async () => {
  await openModal();
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
});

test('warns when records hold money the lines do not account for', async () => {
  apiService.getCollections.mockResolvedValue([
    { id: 4, date: '2026-08-02', payment_method: 'Cash', total_amount: 5000, general_tithes_offering: 3000, sunday_school: 0, custom_fields: { gcash: 2000 } },
  ]);
  await openModal();
  expect(await screen.findByText(/no category breakdown \(Php 2,000.00\)/i)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /collection message/i }).value)
    .not.toContain('no category breakdown');
});

test('shows an empty state for a month with no records', async () => {
  apiService.getCollections.mockResolvedValue([]);
  await openModal();
  expect(await screen.findByText(/No collections recorded in this month/i)).toBeInTheDocument();
});

test('tells the user to copy by hand when both clipboard paths fail', async () => {
  Object.assign(navigator, { clipboard: undefined });
  document.execCommand = jest.fn().mockReturnValue(false);
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  box.select = jest.fn();
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  expect(await screen.findByText(/press and hold to copy/i)).toBeInTheDocument();
  expect(box.select).toHaveBeenCalled();
});

test('surfaces a fetch failure', async () => {
  apiService.getCollections.mockRejectedValue(new Error('Failed to fetch collections'));
  await openModal();
  expect(await screen.findByText(/Failed to fetch collections/i)).toBeInTheDocument();
});
