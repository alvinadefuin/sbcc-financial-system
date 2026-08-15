import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MobileSummary from './MobileSummary';
import apiService from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { getCollections: jest.fn(), getCustomFields: jest.fn() },
}));

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
];

const RECORDS = [
  { id: 1, date: '2026-08-02', payment_method: 'Cash', total_amount: 18100, general_tithes_offering: 18100, custom_fields: {} },
  { id: 2, date: '2026-08-02', payment_method: 'GCash', total_amount: 2000, general_tithes_offering: 2000, custom_fields: {} },
];

let writeText;

beforeEach(() => {
  apiService.getCustomFields.mockResolvedValue(FIELD_DEFS);
  apiService.getCollections.mockResolvedValue(RECORDS);
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10));
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders the message for the latest date with records', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  await waitFor(() => expect(box.value).toContain('Date : AUGUST 02, 2026'));
  expect(box.value).toContain('Tithes & Offering - Php 18,100.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
});

test('copies the message', async () => {
  render(<MobileSummary />);
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0][0]).toContain('SBCC SUNDAY COLLECTION');
});

test('falls back to execCommand when the clipboard API is unavailable', async () => {
  Object.assign(navigator, { clipboard: undefined });
  document.execCommand = jest.fn().mockReturnValue(true);
  render(<MobileSummary />);
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('copy'));
});

test('shows the empty state for a month with no records', async () => {
  apiService.getCollections.mockResolvedValue([]);
  render(<MobileSummary />);
  expect(await screen.findByText(/No collections recorded in this month/i)).toBeInTheDocument();
});

test('two picks build a range summary', async () => {
  apiService.getCollections.mockResolvedValue([
    ...RECORDS,
    { id: 3, date: '2026-08-09', payment_method: 'Cash', total_amount: 500, general_tithes_offering: 500, custom_fields: {} },
  ]);
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });

  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));

  expect(box.value).toContain('Date : AUGUST 02 - AUGUST 09, 2026');
  expect(box.value).toContain('Tithes & Offering - Php 18,600.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
});

test('does not spellcheck the message', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  expect(box).toHaveAttribute('spellcheck', 'false');
});

test('sizes the message box to the message', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  const rows = Number(box.getAttribute('rows'));
  expect(rows).toBeGreaterThanOrEqual(6);
  expect(rows).toBeLessThan(16);
});
