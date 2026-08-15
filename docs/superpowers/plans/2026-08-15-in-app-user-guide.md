# In-App User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plain-language user guide inside the app — a sidebar page on desktop, a header-triggered full-screen overlay on mobile — with content filtered to what the signed-in person's role can actually do.

**Architecture:** All guide text lives as data in one module, `frontend/src/content/guideContent.js`, alongside a `getGuideTopics({ platform, role })` helper that filters by platform and role rank and returns topics pre-grouped for rendering. Two thin presentational components consume it: `HelpGuide` (desktop, Tailwind, styled like `ReportsView`) and `MobileHelp` (mobile overlay, inline styles, styled like `MobileSubmitForm`). They share content and filtering but not markup, because the two halves of this codebase use different styling systems. There is no API call, no loading state, and no error state — the guide is static content compiled into the bundle.

**Tech Stack:** React 19, Create React App (react-scripts 5.0.1), Tailwind CSS, `lucide-react` icons, Jest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-in-app-user-guide-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/content/guideContent.js` | **Create.** Every sentence of both guides, plus `ROLE_RANK` and `getGuideTopics`. The only file to edit when guide wording changes. |
| `frontend/src/content/guideContent.test.js` | **Create.** Content integrity (unique ids, no empty fields) and filtering/role-gating logic. |
| `frontend/src/components/HelpGuide.js` | **Create.** Desktop guide page. Presentational only — takes `role`, renders grouped accordions. |
| `frontend/src/components/HelpGuide.test.js` | **Create.** Group rendering, role gating, accordion open/close and `aria-expanded`. |
| `frontend/src/components/mobile/MobileHelp.js` | **Create.** Mobile full-screen overlay. Takes `onClose`, renders the mobile topics. |
| `frontend/src/components/mobile/MobileHelp.test.js` | **Create.** Topic rendering, accordion behaviour, close button. |
| `frontend/src/components/Dashboard.js` | **Modify.** Add `showHelpGuide` sub-view state, sidebar `Help` section, page title, render block. |
| `frontend/src/components/mobile/MobileLayout.js` | **Modify.** Add `showHelp` state, header Help button, overlay render. |
| `frontend/src/components/mobile/MobileLayout.test.js` | **Create.** Overlay open/close, tab bar still has two tabs, and the form-state-survives-the-overlay regression test. |

### Running tests

All test commands are run **from the `frontend/` directory**. Create React App's test runner defaults to interactive watch mode; `CI=true` and `--watchAll=false` make it run once and exit:

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="<pattern>" --watchAll=false
```

---

## Task 1: Guide content module

The content module holds every sentence of both guides and the one piece of logic in this feature: role filtering. Build it test-first.

**Files:**
- Create: `frontend/src/content/guideContent.js`
- Test: `frontend/src/content/guideContent.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/content/guideContent.test.js`:

```javascript
import { GUIDE_TOPICS, getGuideTopics } from './guideContent';

// getGuideTopics returns [{ group, topics }] — most assertions want a flat list.
const flatten = (groups) => groups.flatMap((g) => g.topics);

test('every topic id is unique', () => {
  const ids = GUIDE_TOPICS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('every topic carries the fields the renderers need', () => {
  expect(GUIDE_TOPICS.length).toBeGreaterThan(0);
  GUIDE_TOPICS.forEach((topic) => {
    expect(typeof topic.title).toBe('string');
    expect(topic.title.length).toBeGreaterThan(0);
    expect(topic.summary.length).toBeGreaterThan(0);
    expect(topic.group.length).toBeGreaterThan(0);
    expect(topic.icon).toBeTruthy();
    expect(Array.isArray(topic.steps)).toBe(true);
    expect(topic.steps.length).toBeGreaterThan(0);
    topic.steps.forEach((step) => expect(step.length).toBeGreaterThan(0));
    expect(['user', 'admin', 'super_admin']).toContain(topic.minRole);
    expect(['mobile', 'desktop']).toContain(topic.platform);
  });
});

test('the mobile guide returns only mobile topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'mobile', role: 'user' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.platform).toBe('mobile'));
});

test('the desktop guide returns only desktop topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'super_admin' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.platform).toBe('desktop'));
});

test('a plain user never receives admin instructions', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'user' }));
  expect(topics.length).toBeGreaterThan(0);
  topics.forEach((topic) => expect(topic.minRole).toBe('user'));
});

test('an admin receives admin topics but no super-admin topics', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'admin' }));
  expect(topics.some((t) => t.minRole === 'admin')).toBe(true);
  expect(topics.some((t) => t.minRole === 'super_admin')).toBe(false);
});

test('a super admin receives every desktop topic', () => {
  const topics = flatten(getGuideTopics({ platform: 'desktop', role: 'super_admin' }));
  const allDesktop = GUIDE_TOPICS.filter((t) => t.platform === 'desktop');
  expect(topics.length).toBe(allDesktop.length);
});

// Failing closed matters: a bad role value must never leak admin instructions.
test.each([['nonsense'], [undefined], [null]])(
  'an unrecognised role (%s) is treated as a plain user',
  (role) => {
    const actual = flatten(getGuideTopics({ platform: 'desktop', role }));
    const asUser = flatten(getGuideTopics({ platform: 'desktop', role: 'user' }));
    expect(actual.map((t) => t.id)).toEqual(asUser.map((t) => t.id));
  }
);

test('groups with no visible topics are omitted entirely', () => {
  const groups = getGuideTopics({ platform: 'desktop', role: 'user' });
  groups.forEach((group) => expect(group.topics.length).toBeGreaterThan(0));
  expect(groups.map((g) => g.group)).not.toContain('Audit');
});

test('a group appears once, holding all of its topics', () => {
  const groups = getGuideTopics({ platform: 'mobile', role: 'user' });
  const names = groups.map((g) => g.group);
  expect(new Set(names).size).toBe(names.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="guideContent" --watchAll=false
```

Expected: FAIL — `Cannot find module './guideContent'`.

- [ ] **Step 3: Write the content module**

Create `frontend/src/content/guideContent.js`. Every icon name below is verified present in the installed `lucide-react`:

```javascript
import {
  LogIn,
  PlusCircle,
  Calculator,
  Edit3,
  WifiOff,
  Clock,
  Compass,
  KeyRound,
  LayoutDashboard,
  BarChart2,
  Calendar,
  BookOpen,
  Printer,
  FileSpreadsheet,
  Trash2,
  Settings,
  UserPlus,
  ShieldCheck,
  UserCog,
  History,
} from 'lucide-react';

// Higher rank sees everything a lower rank sees.
export const ROLE_RANK = { user: 0, admin: 1, super_admin: 2 };

/**
 * Every topic in both guides, in display order.
 *
 * Steps name the real on-screen button labels, in short plain sentences.
 * `hint` is an optional Taglish note, used only where the behaviour is
 * genuinely confusing — not as a translation of every step.
 */
export const GUIDE_TOPICS = [
  // ---------------------------------------------------------------- mobile
  {
    id: 'mobile-signing-in',
    platform: 'mobile',
    group: 'Getting started',
    minRole: 'user',
    icon: LogIn,
    title: 'Signing in',
    summary: 'Getting into the app on your phone.',
    steps: [
      'Open the app link your admin sent you.',
      'Type the email address your admin registered for you.',
      'Type your password, then tap Sign In.',
      'If the password does not work, ask your admin to reset it for you. There is no password screen on the phone — only the admin can change it.',
    ],
    hint: 'Hindi gumagana ang password? Hindi mo kayang palitan sa phone — hingin sa admin na i-reset.',
  },
  {
    id: 'mobile-submit-collection',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: PlusCircle,
    title: 'Send in a collection',
    summary: 'The main thing you will do — recording what was collected.',
    steps: [
      'Tap the Submit tab.',
      'Choose Collection at the top (tap Expense instead if you are recording money the church spent).',
      'Pick the date the money was collected.',
      'Choose Cash or GCash under payment method.',
      'Type the amount beside each fund. Leave a fund blank if there was nothing for it.',
      'Control number, cheque number, and forms number are optional — leave them empty if you do not have them.',
      'Check the total at the bottom, then tap Submit.',
    ],
  },
  {
    id: 'mobile-count-cash',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: Calculator,
    title: 'Counting cash quickly',
    summary: 'Let the app add up the bills and coins for you.',
    steps: [
      'On the Submit tab, open the denomination calculator.',
      'Beside each bill and coin, type how many pieces you counted.',
      'The total adds itself up as you type — you do not need a separate calculator.',
      'Use that total to fill in the amount on the form.',
    ],
  },
  {
    id: 'mobile-add-supplement',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: Edit3,
    title: 'Adding a supplement',
    summary: 'Recording extra money for an entry you already sent.',
    steps: [
      'Tap the Recent tab.',
      'Tap the record you want to add to.',
      'Tap the supplement option shown on that record.',
      'The form opens with the same date already filled in and the other payment method selected.',
      'Type the extra amount, then tap Submit.',
    ],
  },
  {
    id: 'mobile-offline',
    platform: 'mobile',
    group: 'When there is no signal',
    minRole: 'user',
    icon: WifiOff,
    title: 'No internet? It still works',
    summary: 'What happens when you submit with no signal.',
    steps: [
      'Fill in and submit the form the same way you always do.',
      'The entry is saved on your phone. Nothing is lost.',
      'A small amber number appears on the Recent tab counting what is still waiting to be sent.',
      'When your signal comes back, the app sends everything by itself. You do not need to re-type anything.',
      'Do not clear the app data or uninstall the app while entries are still waiting.',
    ],
    hint: 'Walang internet? Okay lang — naka-save sa phone mo. Automatic na masi-send pagbalik ng signal. Huwag lang i-uninstall ang app habang may naghihintay.',
  },
  {
    id: 'mobile-check-sent',
    platform: 'mobile',
    group: 'When there is no signal',
    minRole: 'user',
    icon: Clock,
    title: 'Checking what you already sent',
    summary: 'Telling a waiting entry apart from a sent one.',
    steps: [
      'Tap the Recent tab to see your latest entries.',
      'An entry marked pending is still waiting for signal — it has not reached the office yet.',
      'An entry with no pending mark has been received and saved.',
      'If an entry says it failed, tap retry on that entry.',
    ],
  },

  // --------------------------------------------------------------- desktop
  {
    id: 'desktop-signing-in',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: LogIn,
    title: 'Signing in',
    summary: 'Getting into the dashboard on a computer.',
    steps: [
      'Open the app in your web browser.',
      'Type your email address and password, then click Sign In.',
      'If the password does not work, ask a super admin to reset it for you.',
    ],
  },
  {
    id: 'desktop-navigating',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: Compass,
    title: 'Finding your way around',
    summary: 'What the menu down the left side does.',
    steps: [
      'The menu on the left is how you move between pages. Click any item to open it.',
      'The items are put into small groups — Overview, and whichever other groups your account is allowed to see.',
      'Use the arrow button at the top of the menu to shrink it and give yourself more room. Click it again to bring the labels back.',
      'On a small screen the menu is hidden — tap the three-line button at the top left to slide it open.',
    ],
  },
  {
    id: 'desktop-change-password',
    platform: 'desktop',
    group: 'Getting started',
    minRole: 'user',
    icon: KeyRound,
    title: 'Changing your password',
    summary: 'Setting a new password for yourself.',
    steps: [
      'Click Change Password near the bottom of the left menu.',
      'Type your current password, then your new one twice.',
      'Click save. Use the new password the next time you sign in.',
    ],
  },
  {
    id: 'desktop-dashboard-cards',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: LayoutDashboard,
    title: 'The dashboard at a glance',
    summary: 'What the boxes across the top are telling you.',
    steps: [
      'Click Dashboard in the left menu.',
      'The boxes across the top summarise the period you have selected — money received, money spent, and what is left.',
      'Every peso figure covers only the month and year selected at the top of the page.',
      'These boxes are a summary, not the records themselves. To see individual entries, open Manage Records or Reports.',
    ],
  },
  {
    id: 'desktop-charts',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: BarChart2,
    title: 'Reading the charts',
    summary: 'Comparing collections against expenses over time.',
    steps: [
      'Click Analytics in the left menu.',
      'Each chart plots collections against expenses so you can see them side by side.',
      'Hold your pointer over any bar, line, or slice to see the exact peso amount.',
      'A month with a taller expense bar than collection bar is a month the church spent more than it received.',
    ],
  },
  {
    id: 'desktop-pick-period',
    platform: 'desktop',
    group: 'Reading your numbers',
    minRole: 'user',
    icon: Calendar,
    title: 'Choosing a month or year',
    summary: 'Changing which period every figure covers.',
    steps: [
      'Use the month and year pickers at the top of the page.',
      'Everything on the page — the boxes and the charts — redraws for the period you picked.',
      'If the page looks empty, check the period first. It usually means no records were entered for that month.',
    ],
  },
  {
    id: 'desktop-report-totals',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: BookOpen,
    title: 'Collections, Expenses, and Net Surplus',
    summary: 'What the three report figures actually count.',
    steps: [
      'Click Reports in the left menu.',
      'Collections Total is every peso received in the selected period.',
      'Expenses Total is every peso spent in the same period.',
      'Net Surplus is Collections minus Expenses.',
      'A negative Net Surplus means the church spent more than it received that period. It is not an error in the app.',
    ],
    hint: 'Kapag negative ang Net Surplus, mas malaki ang gastos kaysa nakolekta — hindi ito mali ng system.',
  },
  {
    id: 'desktop-print-report',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: Printer,
    title: 'Printing a report',
    summary: 'Getting a paper copy for a meeting.',
    steps: [
      'Set the month and year you want printed first.',
      'Click Print Report in the left menu.',
      'Check the preview that opens, then use your browser print dialog.',
      'Only the period you selected is printed — change the period and print again for a different month.',
    ],
  },
  {
    id: 'desktop-google-sheets',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: FileSpreadsheet,
    title: 'Sending records to Google Sheets',
    summary: 'Copying the records into a spreadsheet.',
    steps: [
      'Click Reports in the left menu and find the Google Sheets section.',
      'Create a Google Sheet, or open the one the church already uses.',
      'In Google Sheets, click Share, paste in the address shown on the Reports page, and set it to Editor. Viewer is not enough — the app has to write into the sheet.',
      'Copy the sheet link or ID back into the Reports page and save it.',
      'Click Sync. A tab is created for the year and filled with the records.',
      'If syncing fails, the sharing is almost always the cause. Re-check that the address has Editor access.',
    ],
    hint: 'Sa Google Sheets, dapat Editor ang access — hindi Viewer. Ito ang pinaka-madalas na dahilan kung bakit hindi mag-sync.',
  },
  {
    id: 'desktop-edit-record',
    platform: 'desktop',
    group: 'Managing records',
    minRole: 'admin',
    icon: Edit3,
    title: 'Fixing a wrong entry',
    summary: 'Correcting a record a collector already sent.',
    steps: [
      'Click Manage Records in the left menu.',
      'Choose the Collections tab or the Expenses tab.',
      'Find the record and click its edit button.',
      'Change the amounts or details that are wrong. The total recalculates by itself — you do not type it.',
      'Save. The change is recorded in the Activity Log along with your name.',
      'New entries are added from the phone, not from this page.',
    ],
  },
  {
    id: 'desktop-delete-record',
    platform: 'desktop',
    group: 'Managing records',
    minRole: 'admin',
    icon: Trash2,
    title: 'Deleting an entry',
    summary: 'Removing a record that should not be there.',
    steps: [
      'Click Manage Records, then the Collections or Expenses tab.',
      'Find the record and click its delete button.',
      'Confirm when asked.',
      'If the amounts are merely wrong, edit the record instead of deleting it — editing keeps the history.',
    ],
    hint: 'Mali lang ang halaga? I-edit na lang, huwag i-delete — mas maganda para may record.',
  },
  {
    id: 'desktop-mobile-fields',
    platform: 'desktop',
    group: 'Mobile form fields',
    minRole: 'admin',
    icon: Settings,
    title: 'Turning phone form fields on and off',
    summary: 'Choosing what collectors see on their phones.',
    steps: [
      'Click Mobile Form Fields in the left menu.',
      'Choose Collection Fields or Expense Fields.',
      'Switch a field off to hide it from the phone form, or on to show it.',
      'The change reaches collectors immediately, so tell them before you change anything mid-collection.',
      'Turning a field off hides it from new entries. Records already sent keep the values they had.',
    ],
  },
  {
    id: 'desktop-add-user',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: UserPlus,
    title: 'Adding a user',
    summary: 'Giving a new collector an account.',
    steps: [
      'Click Users in the left menu.',
      'Click Add User.',
      'Fill in their name, email address, and a starting password.',
      'Choose their role — pick User for a collector.',
      'Click Add User to save, then pass them the email address and password you set.',
    ],
  },
  {
    id: 'desktop-roles',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: ShieldCheck,
    title: 'What each role can do',
    summary: 'Choosing the right role for someone.',
    steps: [
      'User — sends collections and expenses from the phone. This is the right role for most collectors.',
      'Admin — everything a User can do, plus managing records, users, and the phone form fields.',
      'Super Admin — everything an Admin can do, plus the Activity Log. Only a Super Admin can create another Admin.',
      'When unsure, choose User. You can raise someone later; you cannot un-see what a wider role exposed.',
    ],
  },
  {
    id: 'desktop-edit-user',
    platform: 'desktop',
    group: 'Users and access',
    minRole: 'admin',
    icon: UserCog,
    title: 'Editing or removing access',
    summary: 'Updating someone, or stopping them signing in.',
    steps: [
      'Click Users in the left menu.',
      'Find the person in the list and click edit.',
      'Change their name, role, or password, then save.',
      'To stop someone signing in — a collector who has left the church, for example — remove their access from this same list.',
      'An Admin cannot change a Super Admin account. Ask a Super Admin to do it.',
    ],
  },
  {
    id: 'desktop-activity-log',
    platform: 'desktop',
    group: 'Audit',
    minRole: 'super_admin',
    icon: History,
    title: 'Reading the Activity Log',
    summary: 'Seeing who changed what, and when.',
    steps: [
      'Click Activity Log in the left menu.',
      'Each line shows the date and time, who did it, and what they did.',
      'Click a line to open it and see exactly which values changed, from what to what.',
      'Use the filter to narrow the list down to collections or expenses.',
      'Nothing here can be edited or deleted, by anyone. That is the point — it is the record of record.',
    ],
  },
];

/**
 * Topics for one platform, filtered to what this role may see,
 * grouped in display order.
 *
 * An unknown, missing, or null role falls back to `user` — the narrowest
 * view — so a bad role value can never leak admin instructions.
 *
 * @param {{ platform: 'mobile' | 'desktop', role?: string }} options
 * @returns {Array<{ group: string, topics: Array<object> }>}
 */
export function getGuideTopics({ platform, role }) {
  const rank = ROLE_RANK[role] ?? ROLE_RANK.user;

  const visible = GUIDE_TOPICS.filter(
    (topic) => topic.platform === platform && rank >= ROLE_RANK[topic.minRole]
  );

  return visible.reduce((groups, topic) => {
    const existing = groups.find((group) => group.group === topic.group);
    if (existing) existing.topics.push(topic);
    else groups.push({ group: topic.group, topics: [topic] });
    return groups;
  }, []);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="guideContent" --watchAll=false
```

Expected: PASS — 10 tests passing (the `test.each` block counts as 3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/content/guideContent.js frontend/src/content/guideContent.test.js
git commit -m "feat: add user guide content module with role-based filtering"
```

---

## Task 2: Desktop guide page

**Files:**
- Create: `frontend/src/components/HelpGuide.js`
- Test: `frontend/src/components/HelpGuide.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/HelpGuide.test.js`:

```javascript
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
  fireEvent.click(screen.getByRole('button', { name: /Printing a report/i }));

  expect(screen.getByText(/Open the app in your web browser/i)).toBeInTheDocument();
  expect(screen.getByText(/Set the month and year you want printed first/i)).toBeInTheDocument();
});

test('shows the Taglish hint only for topics that carry one', () => {
  render(<HelpGuide role="user" />);

  fireEvent.click(screen.getByRole('button', { name: /Collections, Expenses, and Net Surplus/i }));
  expect(screen.getByText(/hindi ito mali ng system/i)).toBeInTheDocument();
});

test('renders nothing but survives an unknown role', () => {
  render(<HelpGuide role="nonsense" />);
  expect(screen.getByText('Getting started')).toBeInTheDocument();
  expect(screen.queryByText('Users and access')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="HelpGuide" --watchAll=false
```

Expected: FAIL — `Cannot find module './HelpGuide'`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/HelpGuide.js`. Colours and radii match `ReportsView`:

```javascript
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getGuideTopics } from '../content/guideContent';

const HelpGuide = ({ role }) => {
  const [openIds, setOpenIds] = useState([]);
  const groups = getGuideTopics({ platform: 'desktop', role });

  const toggle = (id) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]
    );

  return (
    <div className="max-w-3xl space-y-8">
      {groups.map(({ group, topics }) => (
        <section key={group}>
          <h3 className="text-[10px] font-bold text-[#b89048] uppercase tracking-widest mb-3">
            {group}
          </h3>

          <div className="space-y-2">
            {topics.map((topic) => {
              const open = openIds.includes(topic.id);
              const panelId = `guide-panel-${topic.id}`;

              return (
                <div
                  key={topic.id}
                  className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(topic.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#fff3d8] transition"
                  >
                    <span className="w-9 h-9 rounded-xl border border-[#e8d090] flex items-center justify-center flex-shrink-0 text-[#c49030] bg-[#fffdf5]">
                      <topic.icon className="w-4 h-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#3d2a08]">{topic.title}</span>
                      <span className="block text-xs text-[#8a6028] mt-0.5">{topic.summary}</span>
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-[#b89048] flex-shrink-0 transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {open && (
                    <div id={panelId} className="px-4 pb-4 pt-3 border-t border-[#f0e4b0]">
                      <ol className="list-decimal ml-5 space-y-1.5 text-sm text-[#3d2a08]">
                        {topic.steps.map((step, index) => (
                          <li key={index} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>

                      {topic.hint && (
                        <p
                          className="mt-3 text-xs rounded-xl px-3 py-2.5 leading-relaxed"
                          style={{
                            background: 'linear-gradient(135deg, #fff8e0, #fdefc0)',
                            border: '1px solid #e8c870',
                            color: '#8a6028',
                          }}
                        >
                          {topic.hint}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default HelpGuide;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="HelpGuide" --watchAll=false
```

Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HelpGuide.js frontend/src/components/HelpGuide.test.js
git commit -m "feat: add desktop user guide page"
```

---

## Task 3: Wire the guide into the desktop dashboard

`Dashboard.js` toggles its pages with one boolean per sub-view. Add a fifth, following the exact pattern of `showActivityLog`.

**Files:**
- Modify: `frontend/src/components/Dashboard.js` (lines 1-24, 62, 97-105, 107-114, 338-344, 587-597)

- [ ] **Step 1: Add the icon imports**

In the `lucide-react` import block at `frontend/src/components/Dashboard.js:2-24`, add `HelpCircle` after `History`:

```javascript
  History,
  HelpCircle,
  KeyRound,
```

Then add the component import after the `ChangePasswordModal` import at line 50:

```javascript
import ChangePasswordModal from "./ChangePasswordModal";
import HelpGuide from "./HelpGuide";
```

- [ ] **Step 2: Add the state**

After `const [showActivityLog, setShowActivityLog] = useState(false);` (line 62), add:

```javascript
  const [showHelpGuide, setShowHelpGuide] = useState(false);
```

- [ ] **Step 3: Register it as a sub-view**

Replace the `clearSubViews` function and the `isSubView` expression (lines 97-105) with:

```javascript
  // Clear all sub-views (management pages)
  const clearSubViews = () => {
    setShowRecordsManager(false);
    setShowUserManagement(false);
    setShowCustomFieldsExample(false);
    setShowCustomFields(false);
    setShowActivityLog(false);
    setShowHelpGuide(false);
  };

  const isSubView = showRecordsManager || showUserManagement || showCustomFieldsExample || showCustomFields || showActivityLog || showHelpGuide;
```

- [ ] **Step 4: Add the page title**

In `getPageTitle` (lines 107-114), add a line after the `showActivityLog` check:

```javascript
    if (showActivityLog) return "Activity Log";
    if (showHelpGuide) return "User Guide";
```

- [ ] **Step 5: Add the sidebar nav section**

In `navSections`, replace the trailing `Actions` section (lines 338-343) with the `Actions` section followed by a new `Help` section. The `Help` section has no role condition — every role sees it:

```javascript
    {
      label: "Actions",
      items: [
        { id: "print", label: "Print Report", icon: Printer, onClick: handlePrint, active: false },
      ],
    },
    {
      label: "Help",
      items: [
        { id: "guide", label: "User Guide", icon: HelpCircle, onClick: () => { clearSubViews(); setShowHelpGuide(true); setSidebarOpen(false); }, active: showHelpGuide },
      ],
    },
  ];
```

- [ ] **Step 6: Render the guide**

In the `<main>` block, immediately after the closing `)}` of the `showActivityLog` block (line 597) and before the `{/* Dashboard views */}` comment, add:

```javascript
          {showHelpGuide && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-stretch gap-3 mb-5">
                <div className="flex-1 p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fef3d0)', border: '1.5px solid #e8d090', borderRadius: '14px 14px 14px 4px' }}>
                  <p className="text-sm font-bold text-left" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                  <p className="text-sm mt-1 text-left" style={{ color: '#3d2a08', lineHeight: 1.4 }}>Step-by-step instructions for everything you can do here. Tap any topic to open it.</p>
                </div>
              </div>
              <HelpGuide role={user?.role} />
            </div>
          )}
```

- [ ] **Step 7: Verify the whole suite still passes**

```bash
cd frontend
CI=true npx react-scripts test --watchAll=false
```

Expected: PASS — every existing suite green, no new failures. `Dashboard.activity.test.js` in particular must still pass, since `clearSubViews` and `isSubView` were edited.

- [ ] **Step 8: Verify it renders in the real app**

```bash
cd frontend && npm start
```

Sign in, confirm a **Help** group appears at the bottom of the left menu with a **User Guide** item, click it, confirm the page title reads "User Guide" and topics expand when clicked. Confirm a non-admin account sees no "Users and access" group. Stop the server when done.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "feat: add User Guide page to the desktop sidebar"
```

---

## Task 4: Mobile guide overlay

The overlay is positioned `absolute` inside `MobileLayout`'s root element, which is already `position: relative` and capped at 430px wide. Using `absolute` rather than `fixed` keeps the overlay inside that centred phone-width column on a desktop browser.

**Files:**
- Create: `frontend/src/components/mobile/MobileHelp.js`
- Test: `frontend/src/components/mobile/MobileHelp.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/mobile/MobileHelp.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="MobileHelp" --watchAll=false
```

Expected: FAIL — `Cannot find module './MobileHelp'`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/mobile/MobileHelp.js`. Inline styles, matching the conventions in `MobileSubmitForm` and `MobileLayout`:

```javascript
import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { getGuideTopics } from '../../content/guideContent';

export default function MobileHelp({ onClose }) {
  const [openIds, setOpenIds] = useState([]);

  // Every mobile topic is minRole 'user'; passing it explicitly keeps the
  // call honest if that ever changes.
  const groups = getGuideTopics({ platform: 'mobile', role: 'user' });

  const toggle = (id) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]
    );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        background: '#fef9f0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Overlay header */}
      <div
        style={{
          padding: '14px 16px',
          flexShrink: 0,
          background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)',
          borderBottom: '1px solid #e8d090',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3d2a08' }}>
          How to use this app
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(196,144,48,0.08)',
            border: '1px solid #e8d090',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <X size={16} style={{ color: '#8a6028' }} />
        </button>
      </div>

      {/* Scrolling topic list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 28px' }}>
        {groups.map(({ group, topics }) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <p
              style={{
                margin: '0 0 8px 2px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#b89048',
              }}
            >
              {group}
            </p>

            {topics.map((topic) => {
              const open = openIds.includes(topic.id);
              const panelId = `mobile-guide-panel-${topic.id}`;

              return (
                <div
                  key={topic.id}
                  style={{
                    background: '#fff8e6',
                    border: '1px solid #e8d090',
                    borderRadius: 12,
                    marginBottom: 8,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => toggle(topic.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 12px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: '#fffdf5',
                        border: '1px solid #e8d090',
                        flexShrink: 0,
                      }}
                    >
                      <topic.icon size={17} style={{ color: '#c49030' }} />
                    </span>

                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#3d2a08',
                          lineHeight: 1.3,
                        }}
                      >
                        {topic.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: '#8a6028',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {topic.summary}
                      </span>
                    </span>

                    <ChevronDown
                      size={16}
                      style={{
                        color: '#b89048',
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>

                  {open && (
                    <div
                      id={panelId}
                      style={{ padding: '10px 14px 14px', borderTop: '1px solid #f0e4b0' }}
                    >
                      <ol style={{ margin: 0, paddingLeft: 18, color: '#3d2a08' }}>
                        {topic.steps.map((step, index) => (
                          <li
                            key={index}
                            style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}
                          >
                            {step}
                          </li>
                        ))}
                      </ol>

                      {topic.hint && (
                        <p
                          style={{
                            margin: '10px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            padding: '9px 11px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #fff8e0, #fdefc0)',
                            border: '1px solid #e8c870',
                            color: '#8a6028',
                          }}
                        >
                          {topic.hint}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="MobileHelp" --watchAll=false
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileHelp.js frontend/src/components/mobile/MobileHelp.test.js
git commit -m "feat: add mobile user guide overlay"
```

---

## Task 5: Wire the overlay into the mobile layout

The guide must **not** become a third tab. `MobileLayout` renders its tabs as a ternary, so switching tabs unmounts `MobileSubmitForm` and discards whatever the collector had typed. The overlay renders on top with the form still mounted underneath. The last test in this task is the regression guard for exactly that.

**Files:**
- Modify: `frontend/src/components/mobile/MobileLayout.js` (lines 1-2, 9-12, 86-115)
- Test: `frontend/src/components/mobile/MobileLayout.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/mobile/MobileLayout.test.js`:

```javascript
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MobileLayout from './MobileLayout';
import apiService from '../../utils/api';
import * as syncQueue from '../../utils/syncQueue';

jest.mock('../../utils/api', () => ({
  getCustomFields: jest.fn(),
  submitForMobile: jest.fn(),
  getRecentEntries: jest.fn(),
}));
jest.mock('../../utils/syncQueue', () => ({ getAll: jest.fn() }));
jest.mock('../../utils/syncManager', () => ({ syncPendingEntries: jest.fn() }));

const user = { name: 'Collector', email: 'collector@sbcc.church' };

const FIELDS = [
  {
    field_name: 'general_tithes_offering',
    field_label: 'General Tithes & Offering',
    field_type: 'decimal',
    display_order: 0,
    is_active: 1,
  },
];

// resetMocks is on for this project, so return values belong here, not in the
// jest.mock factory above.
beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCustomFields.mockResolvedValue(FIELDS);
  apiService.getRecentEntries.mockResolvedValue([]);
  syncQueue.getAll.mockResolvedValue([]);
});

test('keeps the guide hidden until the Help button is pressed', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  expect(screen.queryByText('How to use this app')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));

  expect(screen.getByText('How to use this app')).toBeInTheDocument();
});

test('hides the guide again when it is closed', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));
  fireEvent.click(screen.getByRole('button', { name: /Close/i }));

  expect(screen.queryByText('How to use this app')).not.toBeInTheDocument();
});

// Scoped to the tab bar on purpose: MobileSubmitForm has its own type="submit"
// button, so an unscoped getByRole(/Submit/i) matches two elements and throws.
test('leaves the tab bar at two tabs', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  const tabBar = screen.getByTestId('mobile-tab-bar');

  expect(within(tabBar).getAllByRole('button')).toHaveLength(2);
  expect(within(tabBar).getByText('Submit')).toBeInTheDocument();
  expect(within(tabBar).getByText('Recent')).toBeInTheDocument();
  expect(within(tabBar).queryByText('Help')).not.toBeInTheDocument();
});

// This is the reason the guide is an overlay and not a third tab. A tab switch
// unmounts MobileSubmitForm and wipes a half-filled collection form.
test('a half-filled form survives opening and closing the guide', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  expect(screen.getByLabelText(/General Tithes/i)).toHaveValue('5000');

  fireEvent.click(screen.getByRole('button', { name: /Help/i }));
  fireEvent.click(screen.getByRole('button', { name: /Close/i }));

  expect(screen.getByLabelText(/General Tithes/i)).toHaveValue('5000');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="MobileLayout" --watchAll=false
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name /Help/i`.

- [ ] **Step 3: Add the imports and state**

In `frontend/src/components/mobile/MobileLayout.js`, extend the icon import on line 2 and add the component import after `MobileRecentList`:

```javascript
import { PlusCircle, Clock, HelpCircle } from 'lucide-react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import MobileHelp from './MobileHelp';
```

Then add the state beside the existing `useState` calls, after `const [prefill, setPrefill] = useState(null);` (line 12):

```javascript
  const [showHelp, setShowHelp] = useState(false);
```

- [ ] **Step 4: Add the header Help button**

In the header block, replace the Sign out button (lines 102-114) with a Help button followed by the unchanged Sign out button, wrapped so they sit together:

```javascript
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowHelp(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: '#8a6028',
                padding: '6px 11px',
                borderRadius: 8,
                background: 'rgba(196,144,48,0.08)',
                border: '1px solid #e8d090',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <HelpCircle size={14} />
              Help
            </button>

            <button
              onClick={onLogout}
              style={{
                fontSize: 12, color: '#b89048',
                padding: '6px 13px', borderRadius: 8,
                background: 'rgba(196,144,48,0.08)',
                border: '1px solid #e8d090',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
```

The visible "Help" text is deliberate — a bare `?` glyph is not reliably read as "instructions" by a first-time volunteer.

- [ ] **Step 5: Label the tab bar for the regression test**

The "still two tabs" test needs to scope its query to the tab bar, because `MobileSubmitForm` contributes its own `type="submit"` button to the tree. Add a test id to the inner flex row that holds the two tab buttons (line ~124, `<div style={{ display: 'flex', gap: 6 }}>`):

```javascript
        <div style={{ display: 'flex', gap: 6 }} data-testid="mobile-tab-bar">
```

Nothing else in that block changes.

- [ ] **Step 6: Render the overlay**

At the very end of the component's returned JSX, immediately before the closing `</div>` of the root element (after the Content block that closes at line 163), add:

```javascript
      {showHelp && <MobileHelp onClose={() => setShowHelp(false)} />}
```

It must be the last child of the root `div`, which already carries `position: 'relative'` — that is what the overlay's `position: 'absolute', inset: 0` anchors to. Rendering it here rather than swapping out the content block is what keeps `MobileSubmitForm` mounted underneath.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd frontend
CI=true npx react-scripts test --testPathPattern="MobileLayout" --watchAll=false
```

Expected: PASS — 4 tests passing, including the form-survival test.

- [ ] **Step 8: Run the whole suite**

```bash
cd frontend
CI=true npx react-scripts test --watchAll=false
```

Expected: PASS — every suite green.

- [ ] **Step 9: Verify it works in the real app**

```bash
cd frontend && npm start
```

Open `http://localhost:3000/mobile`, sign in, and narrow the browser window to phone width. Confirm:
- A **Help** button sits in the header beside Sign out.
- Tapping it covers the screen with the guide; topics expand when tapped.
- The tab bar still shows only Submit and Recent.
- Type an amount into the form, open the guide, close it — the amount is still there.

Stop the server when done.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/mobile/MobileLayout.js frontend/src/components/mobile/MobileLayout.test.js
git commit -m "feat: open the mobile user guide from a header button"
```

---

## Done criteria

- `CI=true npx react-scripts test --watchAll=false` passes from `frontend/`, with no pre-existing suite broken.
- Desktop: a **Help → User Guide** item at the bottom of the sidebar, visible to every role, showing only the groups that role can act on.
- Mobile: a **Help** button in the header opening a full-screen overlay; the tab bar still has exactly two tabs; a half-filled form survives the overlay.
- No backend, API, or database files were touched.
- No new npm dependencies.
