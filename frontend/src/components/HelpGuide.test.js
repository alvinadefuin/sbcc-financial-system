import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpGuide from './HelpGuide';

test('shows the group headings for a plain user', () => {
  render(<HelpGuide role="user" />);
  expect(screen.getByText('Getting started')).toBeInTheDocument();
  expect(screen.getByText('Reading your numbers')).toBeInTheDocument();
  expect(screen.getByText('Reports')).toBeInTheDocument();
});

test('hides admin topics from a plain user', () => {
  render(<HelpGuide role="user" />);
  expect(screen.queryByText('Fixing a wrong entry')).not.toBeInTheDocument();
  expect(screen.queryByText('Users and access')).not.toBeInTheDocument();
});

test('shows admin topics to an admin', () => {
  render(<HelpGuide role="admin" />);
  expect(screen.getByText('Fixing a wrong entry')).toBeInTheDocument();
  expect(screen.getByText('Users and access')).toBeInTheDocument();
});

test('hides the activity log from an admin but shows it to a super admin', () => {
  const { unmount } = render(<HelpGuide role="admin" />);
  expect(screen.queryByText('Reading the Activity Log')).not.toBeInTheDocument();
  unmount();

  render(<HelpGuide role="super_admin" />);
  expect(screen.getByText('Reading the Activity Log')).toBeInTheDocument();
});

test('keeps steps hidden until the topic is opened', () => {
  render(<HelpGuide role="user" />);
  const header = screen.getByRole('button', { name: /Signing in/i });

  expect(header).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Open the app in your web browser/i)).not.toBeInTheDocument();

  fireEvent.click(header);

  expect(header).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Open the app in your web browser/i)).toBeInTheDocument();
});

test('closes a topic when its header is clicked again', () => {
  render(<HelpGuide role="user" />);
  const header = screen.getByRole('button', { name: /Signing in/i });

  fireEvent.click(header);
  fireEvent.click(header);

  expect(header).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/Open the app in your web browser/i)).not.toBeInTheDocument();
});

test('leaves an already-open topic open when another is opened', () => {
  render(<HelpGuide role="user" />);

  fireEvent.click(screen.getByRole('button', { name: /Signing in/i }));
  fireEvent.click(screen.getByRole('button', { name: /Sending the collection to the group chat/i }));

  expect(screen.getByText(/Open the app in your web browser/i)).toBeInTheDocument();
  expect(screen.getByText(/Click Sunday Collection in the left menu/i)).toBeInTheDocument();
});

test('shows the Taglish hint only for topics that carry one', () => {
  render(<HelpGuide role="user" />);

  fireEvent.click(screen.getByRole('button', { name: /Collections, Expenses, and Net Surplus/i }));
  expect(screen.getByText(/hindi ito mali ng system/i)).toBeInTheDocument();
});

// The desktop tree is wrapped in <div className="App">, and App.css sets
// `.App { text-align: center }` — leftover Create React App boilerplate. Every
// Dashboard sub-view has to opt out of it explicitly or its prose renders
// centred. These two tests together prove the guide's prose is left-aligned:
// the guide root wins the cascade, and nothing beneath it re-centres. (jsdom
// resolves the cascade but not inheritance, so descendants are checked
// structurally rather than by computed style.)
describe('alignment against the app-wide centring', () => {
  beforeEach(() => {
    const style = document.createElement('style');
    style.setAttribute('data-test-cascade', '');
    // The two rules that actually collide in the browser: App.css's boilerplate
    // and Tailwind's text-left utility.
    style.textContent = '.App { text-align: center } .text-left { text-align: left }';
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.querySelectorAll('style[data-test-cascade]').forEach((el) => el.remove());
  });

  test('the guide root overrides the inherited centring', () => {
    const { container } = render(
      <div className="App">
        <HelpGuide role="super_admin" />
      </div>
    );

    // Sanity: the boilerplate rule really is in play.
    expect(getComputedStyle(container.querySelector('.App')).textAlign).toBe('center');

    // The guide root must resolve to left, whatever class it uses to do it.
    const guideRoot = container.querySelector('.App').firstChild;
    expect(getComputedStyle(guideRoot).textAlign).toBe('left');
  });

  test('nothing inside the guide re-centres the text', () => {
    const { container } = render(<HelpGuide role="super_admin" />);

    container.querySelectorAll('*').forEach((el) => {
      expect(el.className.toString()).not.toMatch(/\btext-center\b|\btext-right\b/);
      expect(['', 'left', 'start']).toContain(el.style.textAlign || '');
    });
  });
});

test('renders nothing but survives an unknown role', () => {
  render(<HelpGuide role="nonsense" />);
  expect(screen.getByText('Getting started')).toBeInTheDocument();
  expect(screen.queryByText('Users and access')).not.toBeInTheDocument();
});
