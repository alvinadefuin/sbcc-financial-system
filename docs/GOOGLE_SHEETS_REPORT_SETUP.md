# Google Sheets Report — One-Time Setup

The Reports tab updates one church-owned Google Spreadsheet in place. The server
authenticates with a Google **service account**. Setup takes ~15 minutes and is
done once.

## 1. Create a service account

1. Go to https://console.cloud.google.com/ and create (or pick) a project,
   e.g. `sbcc-financial-system`.
2. **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
3. **IAM & Admin → Service Accounts** → **Create service account**.
   - Name: `sbcc-reports`
   - No roles needed (spreadsheet access comes from sharing, not IAM).
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` key file downloads.

## 2. Give the server the credentials

**Local development** — save the key file as:

    backend/config/google-credentials.json

(It is gitignored. Never commit it.)

**Production (Railway/host)** — set an environment variable instead:

    GOOGLE_SERVICE_ACCOUNT_JSON = <entire contents of the JSON key file, as one line>

The env var takes priority over the file.

## 3. Create and share the spreadsheet

1. In the church Google account, create a spreadsheet named e.g.
   **"SBCC Financial Reports"**.
2. Click **Share** → add the service account email (looks like
   `sbcc-reports@<project>.iam.gserviceaccount.com`, also shown in the
   Reports tab) → role **Editor**.

## 4. Connect it in the app

1. Log in as an admin → **Reports** tab.
2. Paste the spreadsheet URL into the setup box → **Save**.
3. Pick a year → **Update Report**.

Five tabs are written per year: `<year> Summary`, `<year> Collections`,
`<year> Expenses`, `<year> Collections Detail`, `<year> Expenses Detail`.
Each sync fully rewrites those tabs from the database — manual edits to them
are overwritten. When a new year starts, its tabs are created automatically on
first sync; previous years stay untouched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Google denied access… share the spreadsheet" | Share the sheet (Editor) with the service account email |
| "Spreadsheet not found" | Re-check the URL saved in Reports → Change spreadsheet |
| "credentials are not configured" | Set `GOOGLE_SERVICE_ACCOUNT_JSON` (prod) or add the key file (dev), then restart the server |
