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

// ─── Add/Edit form ────────────────────────────────────────────────────────────

test('+ Add Field button opens the inline form (not a modal)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.getByRole('heading', { name: /Add Field/i })).toBeInTheDocument();
  // Form is NOT inside a fixed/overlay element
  const form = screen.getByRole('button', { name: /^Add Field$/i }).closest('form');
  expect(form).not.toBeNull();
  const formWrapper = form.closest('.fixed');
  expect(formWrapper).toBeNull();
});

test('typing in Display Label auto-fills Field Name on add', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  const labelInput = screen.getByPlaceholderText(/GCash Amount/i);
  fireEvent.change(labelInput, { target: { value: 'GCash Amount' } });

  const fieldNameInput = screen.getByDisplayValue('gcash_amount');
  expect(fieldNameInput).toBeInTheDocument();
});

test('Field Name input is disabled when editing', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);

  const fieldNameInput = screen.getByDisplayValue('general_tithes');
  expect(fieldNameInput).toBeDisabled();
});

test('Advanced section is hidden by default and shows on click', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.queryByText('Category')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));

  expect(screen.getByText('Category')).toBeInTheDocument();
  expect(screen.getByText('Description')).toBeInTheDocument();
});

test('submitting Add form calls createCustomField with correct payload', async () => {
  apiService.createCustomField.mockResolvedValue({ id: 99 });
  apiService.getCustomFields
    .mockResolvedValueOnce(FIELDS)
    .mockResolvedValueOnce([...FIELDS, { id: 99, field_name: 'gcash_amount', field_label: 'GCash Amount', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 4, category: '', description: '' }]);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));
  fireEvent.change(screen.getByPlaceholderText(/GCash Amount/i), { target: { value: 'GCash Amount' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add Field$/i }));

  await waitFor(() =>
    expect(apiService.createCustomField).toHaveBeenCalledWith(
      expect.objectContaining({
        field_label: 'GCash Amount',
        field_name: 'gcash_amount',
        field_type: 'decimal',
        table_name: 'collections',
      })
    )
  );
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: /Add Field/i })).toBeNull()
  );
});

test('submitting Edit form calls updateCustomField with label and metadata only', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  apiService.getCustomFields
    .mockResolvedValueOnce(FIELDS)
    .mockResolvedValueOnce(FIELDS);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);
  const labelInput = screen.getByDisplayValue('General Tithes & Offering');
  fireEvent.change(labelInput, { target: { value: 'General Tithes Updated' } });
  fireEvent.click(screen.getByRole('button', { name: /Update Field/i }));

  await waitFor(() =>
    expect(apiService.updateCustomField).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ field_label: 'General Tithes Updated' })
    )
  );
  // field_name must NOT be in the update payload
  const callArg = apiService.updateCustomField.mock.calls[0][1];
  expect(callArg).not.toHaveProperty('field_name');
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: /Edit Field/i })).toBeNull()
  );
});

test('Cancel link closes the form without saving', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));
  expect(screen.getByRole('heading', { name: /Add Field/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  expect(screen.queryByRole('heading', { name: /Add Field/i })).toBeNull();
  expect(apiService.createCustomField).not.toHaveBeenCalled();
});

// ─── Drag-to-reorder ──────────────────────────────────────────────────────────

test('dragging a field over another reorders them optimistically', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  // Drag row 0 (General Tithes) over row 1 (Bank Interest)
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });

  // After dragOver, Bank Interest should now appear first in the DOM
  const updatedRows = document.querySelectorAll('[draggable]');
  expect(updatedRows[0].textContent).toContain('Bank Interest');
  expect(updatedRows[1].textContent).toContain('General Tithes & Offering');
});

test('drop calls updateCustomField for each field whose display_order changed', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });
  fireEvent.drop(rows[1], { preventDefault: jest.fn() });

  await waitFor(() => expect(apiService.updateCustomField).toHaveBeenCalled());
  // At least 2 fields changed order — both should be updated
  expect(apiService.updateCustomField.mock.calls.length).toBeGreaterThanOrEqual(2);
  // Each call passes display_order
  apiService.updateCustomField.mock.calls.forEach(([_id, payload]) => {
    expect(payload).toHaveProperty('display_order');
  });
});

test('drop error reverts fields to pre-drag order', async () => {
  apiService.updateCustomField.mockRejectedValue(new Error('Network'));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });
  fireEvent.drop(rows[1], { preventDefault: jest.fn() });

  await waitFor(() => {
    const revertedRows = document.querySelectorAll('[draggable]');
    // Order should revert — General Tithes first again
    expect(revertedRows[0].textContent).toContain('General Tithes & Offering');
  });
  expect(screen.getByText(/Failed to save new order/i)).toBeInTheDocument();
});
