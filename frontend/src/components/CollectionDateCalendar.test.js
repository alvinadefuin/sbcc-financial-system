import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CollectionDateCalendar from './CollectionDateCalendar';

const baseProps = {
  year: 2026,
  month: 8,
  availableDates: new Set(['2026-08-02', '2026-08-09']),
  selectedDate: '2026-08-02',
  onSelect: jest.fn(),
  onMonthChange: jest.fn(),
};

test('shows the month and year', () => {
  render(<CollectionDateCalendar {...baseProps} />);
  expect(screen.getByText('AUGUST 2026')).toBeInTheDocument();
});

test('dates with records are clickable', () => {
  const onSelect = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));
  expect(onSelect).toHaveBeenCalledWith('2026-08-09');
});

test('dates without records are disabled and do not fire onSelect', () => {
  const onSelect = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onSelect={onSelect} />);
  const day3 = screen.getByRole('button', { name: 'August 3, 2026' });
  expect(day3).toBeDisabled();
  fireEvent.click(day3);
  expect(onSelect).not.toHaveBeenCalled();
});

test('marks the selected date', () => {
  render(<CollectionDateCalendar {...baseProps} />);
  expect(screen.getByRole('button', { name: 'August 2, 2026' }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'August 9, 2026' }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('paging back goes to the previous month', () => {
  const onMonthChange = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onMonthChange={onMonthChange} />);
  fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
  expect(onMonthChange).toHaveBeenCalledWith(2026, 7);
});

test('paging forward past December rolls into January', () => {
  const onMonthChange = jest.fn();
  render(<CollectionDateCalendar {...baseProps} year={2026} month={12} onMonthChange={onMonthChange} />);
  fireEvent.click(screen.getByRole('button', { name: /next month/i }));
  expect(onMonthChange).toHaveBeenCalledWith(2027, 1);
});

test('renders every day of the month', () => {
  render(<CollectionDateCalendar {...baseProps} year={2026} month={2} />);
  expect(screen.getByRole('button', { name: 'February 28, 2026' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'February 29, 2026' })).not.toBeInTheDocument();
});
