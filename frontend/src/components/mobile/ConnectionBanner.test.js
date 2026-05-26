import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ConnectionBanner from './ConnectionBanner';

// jsdom starts as online
test('shows Synced when online and no pending entries', () => {
  render(<ConnectionBanner pendingCount={0} syncing={false} />);
  expect(screen.getByText('Synced')).toBeInTheDocument();
});

test('shows pending count when offline', () => {
  // Simulate offline
  Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
  render(<ConnectionBanner pendingCount={3} syncing={false} />);
  expect(screen.getByText(/3 entries pending sync/)).toBeInTheDocument();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
});

test('shows Syncing... when syncing prop is true', () => {
  render(<ConnectionBanner pendingCount={0} syncing={true} />);
  expect(screen.getByText('Syncing...')).toBeInTheDocument();
});

test('shows Synced when online with no pending and not syncing', () => {
  render(<ConnectionBanner pendingCount={0} syncing={false} />);
  expect(screen.getByText('Synced')).toBeInTheDocument();
});
