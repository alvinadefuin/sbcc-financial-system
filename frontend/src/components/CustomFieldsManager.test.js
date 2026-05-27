import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomFieldsManager from './CustomFieldsManager';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getCustomFields: jest.fn(),
  createCustomField: jest.fn(),
  updateCustomField: jest.fn(),
  deleteCustomField: jest.fn(),
}));

const FIELDS = [
  { id: 1, field_name: 'general_tithes', field_label: 'General Tithes & Offering', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 0, category: '', description: '' },
  { id: 2, field_name: 'bank_interest', field_label: 'Bank Interest', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 1, category: '', description: '' },
  { id: 3, field_name: 'notes', field_label: 'Notes', field_type: 'text', is_active: 1, is_required: 0, display_order: 2, category: '', description: '' },
  { id: 4, field_name: 'brotherhood', field_label: 'Brotherhood', field_type: 'decimal', is_active: 0, is_required: 0, display_order: 3, category: '', description: '' },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCustomFields.mockResolvedValue(FIELDS);
});

// ─── Structure ───────────────────────────────────────────────────────────────

test('renders as an inline element, not a modal overlay', async () => {
  const { container } = render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(container.querySelector('.fixed')).toBeNull();
  expect(container.querySelector('.inset-0')).toBeNull();
  expect(container.querySelector('.z-50')).toBeNull();
});

test('does not accept an onClose prop (component has no close button)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
});

// ─── Field list ───────────────────────────────────────────────────────────────

test('shows all fields returned by the API', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => {
    expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument();
    expect(screen.getByText('Bank Interest')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Brotherhood')).toBeInTheDocument();
  });
});

test('shows /mobile chip only for decimal fields', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  const chips = screen.getAllByText(/\/mobile/);
  // 3 decimal fields (general_tithes, bank_interest, brotherhood) — including inactive
  expect(chips).toHaveLength(3);
  // Notes is text type — no chip
  const noteRow = screen.getByText('Notes').closest('[draggable]');
  expect(noteRow).not.toHaveTextContent('/mobile');
});

test('inactive rows render at reduced opacity', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('Brotherhood')).toBeInTheDocument());
  const brotherhoodRow = screen.getByText('Brotherhood').closest('[draggable]');
  expect(brotherhoodRow.className).toMatch(/opacity/);
});

test('shows empty state when no fields exist', async () => {
  apiService.getCustomFields.mockResolvedValue([]);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText(/No fields yet/i)).toBeInTheDocument());
});

// ─── Active toggle ────────────────────────────────────────────────────────────

test('active toggle calls updateCustomField with flipped is_active', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  // field id=1 is active (is_active=1) — click to deactivate
  const toggles = screen.getAllByRole('button', { name: /activate|deactivate/i });
  fireEvent.click(toggles[0]);

  expect(apiService.updateCustomField).toHaveBeenCalledWith(1, { is_active: 0 });
});

test('active toggle reverts on API error', async () => {
  apiService.updateCustomField.mockRejectedValue(new Error('Network error'));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const toggles = screen.getAllByRole('button', { name: /activate|deactivate/i });
  fireEvent.click(toggles[0]);

  await waitFor(() => expect(screen.getByText(/Failed to update field/i)).toBeInTheDocument());
});

// ─── Delete ───────────────────────────────────────────────────────────────────

test('delete calls deleteCustomField after confirm', async () => {
  window.confirm = jest.fn().mockReturnValue(true);
  apiService.deleteCustomField.mockResolvedValue({});
  // First call returns full list; second call (after delete) returns filtered list
  apiService.getCustomFields
    .mockResolvedValueOnce(FIELDS)
    .mockResolvedValueOnce(FIELDS.filter((f) => f.id !== 1));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
  fireEvent.click(deleteButtons[0]);

  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(apiService.deleteCustomField).toHaveBeenCalledWith(1));
});

test('delete does nothing when confirm is cancelled', async () => {
  window.confirm = jest.fn().mockReturnValue(false);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
  fireEvent.click(deleteButtons[0]);

  expect(apiService.deleteCustomField).not.toHaveBeenCalled();
});
