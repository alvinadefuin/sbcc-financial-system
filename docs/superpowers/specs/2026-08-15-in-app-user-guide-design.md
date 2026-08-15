# In-App User Guide (Desktop + Mobile)

**Date:** 2026-08-15
**Branch:** feat/in-app-user-guide
**Status:** Approved

## Context

The SBCC Financial System is used by church volunteers, most of whom are not technical. Collectors submit tithes and offerings from their phones at `/mobile`; the treasurer and admins work in the desktop dashboard. Nothing in the app explains how to do either. New volunteers are trained verbally and re-trained every time they forget a step.

The app needs a written guide inside the app itself, in plain language, reachable at the moment someone is stuck.

## Decision

Two guides — one for phone collectors, one for desktop admins — rendered from a single content file.

- **Desktop:** a `Help` section at the bottom of the sidebar with one item, **User Guide**, visible to every role.
- **Mobile:** a third tab in the existing tab bar — **Submit / Recent / Help**.
- Content is data, not JSX. Every sentence lives in `frontend/src/content/guideContent.js`.
- Each topic is a collapsible card with numbered steps in plain English, plus an optional Taglish hint where the concept is genuinely confusing.
- Topics are filtered by the signed-in person's role. A collector never reads instructions for buttons they do not have.

## Scope

Frontend only. No backend, API, or database changes. No new dependencies — `lucide-react` and Tailwind are already in use.

---

## Files

| File | Purpose |
|---|---|
| `frontend/src/content/guideContent.js` | All guide text for both platforms + `getGuideTopics({ platform, role })` |
| `frontend/src/content/guideContent.test.js` | Content integrity + filtering logic |
| `frontend/src/components/HelpGuide.js` | Desktop guide page (Tailwind, matches `ReportsView`) |
| `frontend/src/components/HelpGuide.test.js` | Rendering, role gating, accordion behaviour |
| `frontend/src/components/mobile/MobileHelp.js` | Mobile guide tab (inline styles, matches `MobileSubmitForm`) |
| `frontend/src/components/mobile/MobileHelp.test.js` | Rendering + accordion behaviour |
| `frontend/src/components/Dashboard.js` | Add `showHelpGuide` sub-view + sidebar nav item (modified) |
| `frontend/src/components/mobile/MobileLayout.js` | Add third tab (modified) |

Desktop and mobile share the content and the filtering helper but **not** the markup. The two platforms style themselves differently in this codebase — desktop uses Tailwind utility classes, mobile uses inline style objects — and forcing one shared renderer would mean one of them stops matching its neighbours.

---

## 1. Content Module

### Topic shape

```js
{
  id: "submit-collection",        // unique across all topics
  platform: "mobile",             // "mobile" | "desktop"
  group: "Sending collections",   // section heading
  minRole: "user",                // "user" | "admin" | "super_admin"
  icon: PlusCircle,               // lucide-react component
  title: "Send in a collection",
  summary: "One line describing what this is for.",
  steps: ["Tap the Submit tab.", "Pick the date.", "..."],
  hint: "Walang internet? Okay lang — naka-save pa rin sa phone mo.", // optional
}
```

`icon` holds the imported lucide component directly, so the renderers stay dumb — no name-to-component lookup table.

### Filtering

```js
const ROLE_RANK = { user: 0, admin: 1, super_admin: 2 };
```

`getGuideTopics({ platform, role })` returns topics where `platform` matches and `ROLE_RANK[role] >= ROLE_RANK[topic.minRole]`.

- An unknown, missing, or `null` role falls back to `user` (rank 0). Failing closed means a bad role value can never leak admin instructions.
- The helper returns topics grouped for rendering: an ordered array of `{ group, topics }`. A group whose topics are all filtered out is omitted entirely — no empty headings.

---

## 2. Guide Content

Every step names the real on-screen button or label. Sentences are short and avoid system vocabulary ("sync queue", "authenticate", "payload"). Taglish hints appear only on genuinely confusing behaviour, not as a translation of every step.

### Mobile guide — all topics `minRole: "user"`

**Group: Getting started**
1. **Signing in** — entering email and password, and what to do when the password does not work. The phone app has no change-password screen (`ChangePasswordModal` is wired into the desktop dashboard only), so this topic says plainly: ask your admin to reset it for you. It must not describe a self-service option that does not exist on mobile.

**Group: Sending collections**
2. **Send in a collection** — Submit tab → pick the date → choose Cash or GCash → fill in the amounts → tap Submit. Mentions the optional control number, cheque number, and forms number fields and that they can be left blank.
3. **Counting cash quickly** — the denomination calculator: enter how many of each bill and coin, and the total fills itself in.
4. **Adding a supplement** — tapping a record in the Recent list to add a follow-up amount to an entry already sent.

**Group: When there's no signal**
5. **No internet? It still works** — the entry saves on the phone, an amber badge on the Recent tab counts what is waiting, and everything sends by itself once signal returns. *Hint: "Walang internet? Okay lang — naka-save sa phone mo. Automatic na masi-send pagbalik ng signal."*
6. **Checking what you already sent** — Recent tab, and how to tell a waiting entry from a sent one.

### Desktop guide

**Group: Getting started** — `minRole: "user"`
1. **Signing in**
2. **Finding your way around** — the sidebar sections and how to collapse it
3. **Changing your password**

**Group: Reading your numbers** — `minRole: "user"`
4. **The dashboard at a glance** — what each summary card means
5. **The charts** — reading collections vs. expenses month to month
6. **Choosing a month or year**

**Group: Reports** — `minRole: "user"`
7. **Collections Total, Expenses Total, Net Surplus** — what each figure counts, and that a negative Net Surplus means the church spent more than it received that period
8. **Printing a report**
9. **Sending records to Google Sheets** — create the sheet, share it as **Editor** with the service account address shown on screen, then press Sync. *Hint covers the Editor share, which is the step that most often fails.*

**Group: Managing records** — `minRole: "admin"`
10. **Fixing a wrong entry** — Manage Records → Collections or Expenses tab → Edit
11. **Deleting an entry** — and that new entries are added from the phone, not here

**Group: Mobile form fields** — `minRole: "admin"`
12. **Turning phone form fields on and off** — what collectors will and will not see after a change

**Group: Users and access** — `minRole: "admin"`
13. **Adding a user**
14. **What each role can do** — User, Admin, Super Admin
15. **Editing or deactivating a user**

**Group: Audit** — `minRole: "super_admin"`
16. **Reading the Activity Log** — who changed what, and when

---

## 3. Rendering and Behaviour

Both renderers walk the grouped result from `getGuideTopics` and draw a section heading per group and a card per topic.

- Topics start **collapsed**. Tapping a header toggles that topic; more than one may be open at once.
- Each card header is a real `<button>` carrying `aria-expanded` and `aria-controls`, with the steps panel carrying the matching `id`. Keyboard and screen-reader users get the same behaviour as pointer users.
- Steps render as an ordered list. The Taglish hint, when present, renders below the steps in a visually distinct callout (warm amber, matching the app's `#d4a843` accent).
- Desktop styling follows `ReportsView` — `bg-[#fff8e6]` cards, `border-[#e8d090]`, `rounded-2xl`. Mobile styling follows `MobileSubmitForm`'s inline-style conventions.

### Desktop integration

`Dashboard.js` gains a `showHelpGuide` boolean alongside the existing sub-view flags:

- Added to `clearSubViews()` and to the `isSubView` expression.
- `getPageTitle()` returns `"User Guide"` when it is set.
- A new final nav section `{ label: "Help", items: [{ id: "guide", label: "User Guide", icon: HelpCircle, ... }] }`, placed after `Actions`, with no role condition.
- Rendered in the sub-view block as `{showHelpGuide && <HelpGuide role={user?.role} />}`.

### Mobile integration

`MobileLayout.js` gains a third tab button using the existing `tabStyle`/`tabLabel` helpers and `HelpCircle`, with the content branch extended to render `<MobileHelp />` when `tab === 'help'`.

---

## 4. Error Handling

There is no network call, no loading state, and no error state — the guide is static content compiled into the bundle, so there is nothing that can fail to load or time out. The single defensive behaviour is the role fallback described in §1: an unrecognised role is treated as `user`.

---

## 5. Testing

**`guideContent.test.js`**
- Every topic id is unique across the whole content set.
- Every topic has a non-empty `title`, `summary`, `steps`, `group`, and a `minRole` that is one of the three known values.
- `getGuideTopics({ platform: "mobile" })` returns only mobile topics; likewise for desktop.
- A `user` role receives no topic whose `minRole` is `admin` or `super_admin`.
- An `admin` receives admin topics but no `super_admin` topics.
- A `super_admin` receives every desktop topic.
- An unknown role (`"nonsense"`), `undefined`, and `null` each behave exactly like `user`.
- Groups containing no visible topics are absent from the result.

**`HelpGuide.test.js`**
- Renders the group headings for the given role.
- An admin-only topic title is absent for `role="user"` and present for `role="admin"`.
- Steps are not in the document until the topic header is clicked; after clicking, the steps appear and `aria-expanded` flips to `true`.
- Clicking a second topic leaves the first one open.

**`MobileHelp.test.js`**
- Renders the mobile topic titles.
- Clicking a header reveals its steps and flips `aria-expanded`.

Per the project's CRA/Jest setup, any mock return values belong in `beforeEach`, not in a `jest.mock` factory — `resetMocks` is on.

---

## Out of Scope

- **Search box** — with topics grouped and collapsed (6 on mobile, 16 on desktop), scanning is faster than typing.
- **"Print this guide" button** — deferred until someone asks for a paper copy.
- **Screenshots** — they go stale on every UI change and would need re-capturing each release. Steps name the real button labels instead.
- **A guided tour / highlight overlay** — considered and rejected; far more code, and it cannot be re-read later.
- **A public logged-out `/guide` URL** — considered; deferred. The guide is reachable once signed in, which covers the training case.
- **A Filipino/English language toggle** — rejected in favour of English steps with targeted Taglish hints, so the wording still matches the English button labels on screen.
- **Backend, API, or database changes** — none.
