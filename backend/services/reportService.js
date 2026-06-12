// Pure aggregation + sheet-grid building. No I/O — callers fetch rows.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLLECTION_CATEGORIES = [
  { key: "general_tithes_offering", label: "General Tithes & Offering" },
  { key: "bank_interest", label: "Bank Interest" },
  { key: "sisterhood_san_juan", label: "Sisterhood San Juan" },
  { key: "sisterhood_labuin", label: "Sisterhood Labuin" },
  { key: "brotherhood", label: "Brotherhood" },
  { key: "youth", label: "Youth" },
  { key: "couples", label: "Couples" },
  { key: "sunday_school", label: "Sunday School" },
  { key: "special_purpose_pledge", label: "Special/Pledge" },
];

// label doubles as the budget_categories.subcategory lookup key (exact seeded strings)
const OPERATIONAL_EXPENSE_CATEGORIES = [
  { key: "pastoral_worker_support", label: "Pastoral & Worker Support" },
  { key: "cap_assistance", label: "CAP-Churches Assistance Program" },
  { key: "honorarium", label: "Honorarium" },
  { key: "conference_seminar", label: "Conference/Seminar/Retreat/Assembly" },
  { key: "fellowship_events", label: "Fellowship Events" },
  { key: "anniversary_christmas", label: "Anniversary/Christmas Events" },
  { key: "supplies", label: "Supplies" },
  { key: "utilities", label: "Utilities" },
  { key: "vehicle_maintenance", label: "Vehicle Maintenance" },
  { key: "lto_registration", label: "LTO Registration" },
  { key: "transportation_gas", label: "Transportation & Gas" },
  { key: "building_maintenance", label: "Building Maintenance" },
  { key: "abccop_national", label: "ABCCOP National" },
  { key: "cbcc_share", label: "CBCC Share" },
  { key: "kabalikat_share", label: "Kabalikat Share" },
  { key: "abccop_community", label: "ABCCOP Community Day" },
];

const round2 = (n) => Math.round(n * 100) / 100;
const zeros12 = () => Array(12).fill(0);

// SQLite returns "YYYY-MM-DD" strings; PG returns Date objects
function monthIndex(dateVal) {
  if (dateVal instanceof Date) return dateVal.getMonth();
  return parseInt(String(dateVal).slice(5, 7), 10) - 1;
}

function dateString(dateVal) {
  if (dateVal instanceof Date) return dateVal.toISOString().slice(0, 10);
  return String(dateVal).slice(0, 10);
}

function aggregateCollections(rows) {
  const categories = COLLECTION_CATEGORIES.map((c) => ({ ...c, months: zeros12(), total: 0 }));
  const shares = { pbcm: zeros12(), pastoral: zeros12(), operational: zeros12() };
  const monthlyTotals = zeros12();

  for (const row of rows) {
    const m = monthIndex(row.date);
    if (m < 0 || m > 11 || Number.isNaN(m)) continue;
    for (const cat of categories) {
      const amount = parseFloat(row[cat.key]) || 0;
      if (!amount) continue;
      cat.months[m] = round2(cat.months[m] + amount);
      cat.total = round2(cat.total + amount);
    }
    monthlyTotals[m] = round2(monthlyTotals[m] + (parseFloat(row.total_amount) || 0));
    shares.pbcm[m] = round2(shares.pbcm[m] + (parseFloat(row.pbcm_share) || 0));
    shares.pastoral[m] = round2(shares.pastoral[m] + (parseFloat(row.pastoral_team_share) || 0));
    shares.operational[m] = round2(shares.operational[m] + (parseFloat(row.operational_fund_share) || 0));
  }

  const grandTotal = round2(monthlyTotals.reduce((a, b) => a + b, 0));
  return { categories, monthlyTotals, grandTotal, shares };
}

function aggregateExpenses(rows, budgetRows) {
  const budgetBySubcat = {};
  for (const b of budgetRows || []) {
    budgetBySubcat[b.subcategory || b.category] = parseFloat(b.budget_amount) || 0;
  }

  const makeRow = (key, label, budgetKey) => ({
    key,
    label,
    monthlyBudget: budgetKey in budgetBySubcat ? budgetBySubcat[budgetKey] : null,
    months: zeros12(),
    total: 0,
  });

  const pbcmRow = makeRow("pbcm_share_expense", "PBCM Share/PDOT", "PBCM Share");
  const pastoralRow = makeRow("pastoral_team", "Pastoral Team", "Pastoral Team");
  const operationalRows = OPERATIONAL_EXPENSE_CATEGORIES.map((c) => makeRow(c.key, c.label, c.label));

  const monthlyTotals = zeros12();

  for (const row of rows) {
    const m = monthIndex(row.date);
    if (m < 0 || m > 11 || Number.isNaN(m)) continue;
    const add = (target, amount) => {
      if (!amount) return;
      target.months[m] = round2(target.months[m] + amount);
      target.total = round2(target.total + amount);
    };
    add(pbcmRow, parseFloat(row.pbcm_share_expense) || 0);
    if (row.fund_source === "pastoral_team") add(pastoralRow, parseFloat(row.total_amount) || 0);
    for (let i = 0; i < OPERATIONAL_EXPENSE_CATEGORIES.length; i++) {
      add(operationalRows[i], parseFloat(row[OPERATIONAL_EXPENSE_CATEGORIES[i].key]) || 0);
    }
    monthlyTotals[m] = round2(monthlyTotals[m] + (parseFloat(row.total_amount) || 0));
  }

  const finalize = (r) => ({
    ...r,
    annualBudget: r.monthlyBudget == null ? null : round2(r.monthlyBudget * 12),
    variance: r.monthlyBudget == null ? null : round2(r.monthlyBudget * 12 - r.total),
  });

  const sections = [
    { label: "PBCM Share/PDOT (10%)", rows: [finalize(pbcmRow)] },
    { label: "Pastoral Team (10%)", rows: [finalize(pastoralRow)] },
    { label: "Operational Fund (80%)", rows: operationalRows.map(finalize) },
  ];

  const grandTotal = round2(monthlyTotals.reduce((a, b) => a + b, 0));
  return { sections, monthlyTotals, grandTotal };
}

module.exports = {
  MONTHS,
  COLLECTION_CATEGORIES,
  OPERATIONAL_EXPENSE_CATEGORIES,
  round2,
  monthIndex,
  dateString,
  aggregateCollections,
  aggregateExpenses,
};
