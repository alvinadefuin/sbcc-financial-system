import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ConnectionBanner from './ConnectionBanner';

// Banner returns null when online, no pending, not syncing (auto-hide behavior)
test('renders nothing when online and fully synced', () => {
  const { container } = render(<ConnectionBanner pendingCount={0} syncing={false} />);
  expect(container.firstChild).toBeNull();
});

test('shows queued count when offline', () => {
  Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
  render(<ConnectionBanner pendingCount={3} syncing={false} />);
  expect(screen.getByText(/3 entries queued/)).toBeInTheDocument();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
});

test('shows Syncing when syncing prop is true', () => {
  render(<ConnectionBanner pendingCount={0} syncing={true} />);
  expect(screen.getByText(/Syncing/)).toBeInTheDocument();
});

test('shows pending count when online but entries are pending', () => {
  render(<ConnectionBanner pendingCount={2} syncing={false} />);
  expect(screen.getByText(/2 entries pending sync/)).toBeInTheDocument();
});
