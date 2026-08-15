import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileHelp from './MobileHelp';

test('shows the mobile topics grouped under their headings', () => {
  render(<MobileHelp onClose={jest.fn()} />);

  expect(screen.getByText('Getting started')).toBeInTheDocument();
  expect(screen.getByText('Sending collections')).toBeInTheDocument();
  expect(screen.getByText('Send in a collection')).toBeInTheDocument();
  expect(screen.getByText('No internet? It still works')).toBeInTheDocument();
});

test('does not show desktop-only topics', () => {
  render(<MobileHelp onClose={jest.fn()} />);
  expect(screen.queryByText('Reading the Activity Log')).not.toBeInTheDocument();
  expect(screen.queryByText('Fixing a wrong entry')).not.toBeInTheDocument();
});

test('keeps steps hidden until the topic is opened', () => {
  render(<MobileHelp onClose={jest.fn()} />);
  const header = screen.getByRole('button', { name: /Send in a collection/i });

  expect(header).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Tap the Submit tab/i)).not.toBeInTheDocument();

  fireEvent.click(header);

  expect(header).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Tap the Submit tab/i)).toBeInTheDocument();
});

test('closes a topic when its header is clicked again', () => {
  render(<MobileHelp onClose={jest.fn()} />);
  const header = screen.getByRole('button', { name: /Send in a collection/i });

  fireEvent.click(header);
  fireEvent.click(header);

  expect(header).toHaveAttribute('aria-expanded', 'false');
});

test('shows the Taglish hint on the offline topic', () => {
  render(<MobileHelp onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /No internet/i }));
  expect(screen.getByText(/naka-save sa phone mo/i)).toBeInTheDocument();
});

test('calls onClose when the close button is pressed', () => {
  const onClose = jest.fn();
  render(<MobileHelp onClose={onClose} />);

  fireEvent.click(screen.getByRole('button', { name: /close/i }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
