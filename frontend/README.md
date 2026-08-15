# SBCC Financial System — Frontend

React 19 SPA (Create React App) with Tailwind CSS. Serves two experiences from
one bundle:

- **Desktop dashboard** — everything except `/mobile`, rendered by
  `src/components/Dashboard.js`
- **Mobile PWA** — `/mobile`, rendered by `src/components/mobile/MobileLayout.js`,
  with an offline submission queue

See the root `README.md` for the full system overview and `../CLAUDE.md` for
working rules.

## Scripts

```bash
npm start          # dev server on http://localhost:3000
npm run build      # production build to build/
npm test           # React Testing Library (watch mode)
```

Environment-specific variants exist for staging and production:
`npm run start:staging`, `npm run build:prod`, and so on.

## API origin

`src/utils/api.js` reads `REACT_APP_API_URL`:

- **empty** → same origin. Correct for production and for `npx vercel dev`.
- **`http://localhost:3001`** → the standalone Express server in `backend/`.

Set it in `.env.development` or `.env.local`.

## Layout

| Path | Contents |
|---|---|
| `src/components/` | Desktop views — Dashboard, records, users, reports, activity log, help |
| `src/components/mobile/` | PWA — submit form, denomination calculator, recent list, summary |
| `src/content/guideContent.js` | In-app user guide copy, split by platform and role |
| `src/hooks/` | `useSundaySummary` — shared summary data |
| `src/utils/` | `api.js` (axios + auth interceptors), `sundaySummary.js`, `syncQueue.js` / `syncManager.js` (IndexedDB offline queue), `theme.js` |
| `public/sw.js` | Service worker caching the app shell |

## Testing notes

Jest is configured with `resetMocks: true` (CRA default), so mock return values
must be set in `beforeEach` rather than in the `jest.mock` factory — a factory
return value is wiped before the first test runs.

Tests sit next to the code they cover as `*.test.js`.
