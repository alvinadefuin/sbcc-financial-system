import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import UserManagement from './UserManagement';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getUsers: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}));

const SUPER = { id: 9, email: 'boss@sbcc.church', name: 'Boss', role: 'super_admin' };

const USERS = [
  { id: 1, name: 'Alvin Adefuin', email: 'adefuin29@gmail.com', role: 'user', is_active: true,
    last_login: '2026-08-16T01:00:00Z', created_at: '2026-08-16T00:00:00Z' },
  { id: 2, name: 'Church Super Administrator', email: 'admin@sbcc.church', role: 'super_admin', is_active: true,
    last_login: '2026-08-16T02:00:00Z', created_at: '2025-12-14T00:00:00Z' },
  { id: 3, name: '', email: 'policarpiomasocorro@gmail.com', role: 'user', is_active: true,
    last_login: null, created_at: '2025-12-14T01:00:00Z' },
  { id: 4, name: 'Luz Alipio', email: 'luzalipio8@gmail.com', role: 'admin', is_active: true,
    last_login: '2026-08-16T03:00:00Z', created_at: '2026-08-16T01:00:00Z' },
];

// CRA sets resetMocks: true, which strips implementations declared in the
// jest.mock factory above — so the return values belong here.
beforeEach(() => {
  jest.clearAllMocks();
  apiService.getUsers.mockResolvedValue(USERS);
  apiService.createUser.mockResolvedValue({ id: 5 });
  apiService.updateUser.mockResolvedValue({});
  apiService.deleteUser.mockResolvedValue({});
});

// `findByText` rather than `getByText`: the list arrives from an async
// getUsers(), so every test has to wait for the first paint. Exported shape is
// used by every later describe block in this file.
const rowFor = async (label) => (await screen.findByText(label)).closest('tr');

test('an account that has never signed in is labelled by its email', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('policarpiomasocorro@gmail.com')).toBeInTheDocument();
});

test('the avatar letter comes from the same fallback as the label', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('P')).toBeInTheDocument();
});

test('accounts with a stored name still show it', async () => {
  render(<UserManagement user={SUPER} />);

  expect(await screen.findByText('Luz Alipio')).toBeInTheDocument();
});

test('the delete confirmation names the account the same way the row does', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  fireEvent.click(within(row).getByTitle('Delete user'));

  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('policarpiomasocorro'));
  confirm.mockRestore();
});

describe('the add/edit modal', () => {
  // Two buttons read "Add User" once the modal is open: the header button that
  // opens it, and the modal's submit. The header renders first in DOM order,
  // so the submit is the last match.
  const openAddModal = () => fireEvent.click(screen.getByText('Add User'));
  const submitAddModal = () =>
    fireEvent.click(screen.getAllByRole('button', { name: 'Add User' }).at(-1));

  test('does not ask for a name when adding', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();

    expect(screen.getByText('Email *')).toBeInTheDocument();
    expect(screen.queryByText(/^Name/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
  });

  test('does not ask for a name when editing either', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio'); // defined at the top of this file

    fireEvent.click(within(row).getByTitle('Edit user'));

    expect(await screen.findByText('Edit User')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
  });

  // Google overwrites users.name from the OAuth payload on every sign-in, so a
  // name typed here would survive only until the account's first login.
  test('creates a user from an email and a role alone', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();
    fireEvent.change(screen.getByPlaceholderText('user@gmail.com'), {
      target: { value: 'new@sbcc.church' },
    });
    submitAddModal();

    await waitFor(() => expect(apiService.createUser).toHaveBeenCalled());
    expect(apiService.createUser).toHaveBeenCalledWith({ email: 'new@sbcc.church', role: 'user' });
  });

  test('still refuses an empty email', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();
    submitAddModal();

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(apiService.createUser).not.toHaveBeenCalled();
  });

  test('an edit sends role and status, and no name', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    fireEvent.click(within(row).getByTitle('Edit user'));
    await screen.findByText('Edit User');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(apiService.updateUser).toHaveBeenCalled());
    expect(apiService.updateUser).toHaveBeenCalledWith(4, { role: 'admin', is_active: true });
  });
});

// App.css carries the Create React App boilerplate `.App { text-align: center }`,
// which every desktop view inherits. The <th>s already opt out with an explicit
// text-left; the <td>s did not, which is why a name rendered centred over the
// email beneath it. jsdom resolves the cascade but not inheritance, so this is
// asserted structurally — the same constraint HelpGuide.test.js documents.
describe('table layout', () => {
  test('every content cell opts out of the app-wide centring', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(6);
    cells.slice(0, 5).forEach((cell) => expect(cell).toHaveClass('text-left'));
  });

  test('the actions column stays right-aligned', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const cells = within(row).getAllByRole('cell');
    expect(cells[5]).toHaveClass('text-right');
    expect(cells[5]).not.toHaveClass('text-left');
  });

  test('column widths are declared rather than left to the browser', async () => {
    const { container } = render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    const table = container.querySelector('table');
    expect(table).toHaveClass('table-fixed');
    expect(container.querySelectorAll('colgroup col')).toHaveLength(6);
  });

  // truncate is inert on a flex child without min-w-0 — the child will not
  // shrink below its content width, so the ellipsis never appears.
  test('a long email truncates instead of widening the column', async () => {
    const { container } = render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const email = within(row).getByText('luzalipio8@gmail.com');
    expect(email).toHaveClass('truncate');
    expect(email.parentElement).toHaveClass('min-w-0');
  });
});

describe('sorting', () => {
  const order = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].querySelector('p').textContent);

  test('opens on newest created first, matching the order the server sends', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    expect(order()).toEqual([
      'Luz Alipio',
      'Alvin Adefuin',
      'policarpiomasocorro',
      'Church Super Administrator',
    ]);
  });

  test('clicking a header sorts by it and a second click flips the direction', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by User'));
    expect(order()).toEqual([
      'Alvin Adefuin',
      'Church Super Administrator',
      'Luz Alipio',
      'policarpiomasocorro',
    ]);

    fireEvent.click(screen.getByLabelText('Sort by User'));
    expect(order()).toEqual([
      'policarpiomasocorro',
      'Luz Alipio',
      'Church Super Administrator',
      'Alvin Adefuin',
    ]);
  });

  // First press on Role is descending — most privileged first, which is what
  // anyone clicking a Role header is looking for.
  test('sorting by role puts super admins on top, not alphabetical order', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Role'));
    expect(order()[0]).toBe('Church Super Administrator');
    expect(order()[1]).toBe('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Role'));
    expect(order().at(-1)).toBe('Church Super Administrator');
  });

  test('an account that never signed in sorts last under Last Login, both ways', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Last Login'));
    expect(order().at(-1)).toBe('policarpiomasocorro');

    fireEvent.click(screen.getByLabelText('Sort by Last Login'));
    expect(order().at(-1)).toBe('policarpiomasocorro');
  });

  test('Status and Actions are not sortable', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    expect(screen.queryByLabelText('Sort by Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sort by Actions')).not.toBeInTheDocument();
  });

  test('search and sort compose', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.change(screen.getByPlaceholderText('Search users…'), {
      target: { value: 'gmail.com' },
    });
    fireEvent.click(screen.getByLabelText('Sort by User'));

    expect(order()).toEqual(['Alvin Adefuin', 'Luz Alipio', 'policarpiomasocorro']);
  });
});
