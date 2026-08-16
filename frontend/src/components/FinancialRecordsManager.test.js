import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FinancialRecordsManager from './FinancialRecordsManager';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: {
    getCollections: jest.fn(),
    getExpenses: jest.fn(),
    getCustomFields: jest.fn(),
    updateCollection: jest.fn(),
  }
}));

const mockCollectionData = [
  {
    id: 1,
    date: '2026-06-01',
    particular: 'Test Collection',
    control_number: 'C2026-001',
    total_amount: 5000,
    general_tithes_offering: 3000,
    bank_interest: 500,
    sisterhood_san_juan: 0,
    sisterhood_labuin: 0,
    brotherhood: 0,
    youth: 0,
    couples: 0,
    sunday_school: 0,
    special_purpose_pledge: 1500,
    custom_fields: {}
  }
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCollections.mockResolvedValue(mockCollectionData);
  apiService.getExpenses.mockResolvedValue([]);
  apiService.getCustomFields.mockResolvedValue([]);
  apiService.updateCollection.mockResolvedValue({});
});

describe('FinancialRecordsManager — desktop restrictions', () => {
  test('does not render an Add Collection button', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    expect(screen.queryByText(/add collection/i)).not.toBeInTheDocument();
  });

  test('does not render an Add Expense button', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    expect(screen.queryByText(/add expense/i)).not.toBeInTheDocument();
  });

  test('edit modal shows no total amount input', async () => {
    // The Edit control is admin-gated, so this test needs a permitted role.
    render(<FinancialRecordsManager user={{ role: 'admin', email: 'a@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByPlaceholderText('30,188.00')).not.toBeInTheDocument();
  });

  test('edit modal shows a read-only Total Amount summary row', async () => {
    // The Edit control is admin-gated, so this test needs a permitted role.
    render(<FinancialRecordsManager user={{ role: 'admin', email: 'a@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));
    fireEvent.click(screen.getByTitle('Edit'));
    // Label exists
    expect(screen.getByTestId('total-amount-summary-label')).toHaveTextContent('Total Amount');
    // Value reflects calculated total (3000 + 500 + 1500 = 5000)
    expect(screen.getByTestId('total-amount-summary-value')).toHaveTextContent('₱5,000.00');
  });
});

describe('sorting', () => {
  // Points the already-mocked API at a fixture and renders. `beforeEach` in
  // this file has stubbed getExpenses/getCustomFields already.
  const renderWithRows = (rows) => {
    apiService.getCollections.mockResolvedValue(rows);
    return render(<FinancialRecordsManager />);
  };

  const sortRows = [
    { id: 1, date: '2026-08-16', control_number: '2026-001', particular: 'First',  total_amount: 100, created_at: '2026-08-16T04:41:00.000Z' },
    { id: 2, date: '2026-08-16', control_number: '2026-002', particular: 'Second', total_amount: 200, created_at: '2026-08-16T04:47:00.000Z' },
    { id: 3, date: '2026-08-16', control_number: '2026-003', particular: 'Third',  total_amount: 300, created_at: '2026-08-16T04:50:00.000Z' },
  ];

  // Reads the Particular cell of each body row, which is unique per fixture.
  const rowOrder = () =>
    screen.getAllByRole('row').slice(1).map((r) => r.cells[2].textContent);

  test('defaults to newest submission first, not reference order', async () => {
    // All three share a collection date, so only created_at can order them.
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    expect(rowOrder()).toEqual(['Third', 'Second', 'First']);
  });

  test('clicking Date flips to oldest first', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));
    expect(rowOrder()).toEqual(['First', 'Second', 'Third']);
  });

  test('clicking Reference sorts by control number ascending', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    expect(rowOrder()).toEqual(['First', 'Second', 'Third']);
  });

  test('clicking Reference twice reverses it', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    expect(rowOrder()).toEqual(['Third', 'Second', 'First']);
  });
});

describe('role-based controls', () => {
  test('user role sees no edit or delete buttons', async () => {
    render(<FinancialRecordsManager user={{ role: 'user', email: 'm@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));

    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  test('admin role sees edit and delete buttons', async () => {
    render(<FinancialRecordsManager user={{ role: 'admin', email: 'a@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));

    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });
});
