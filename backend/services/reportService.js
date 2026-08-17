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

// The Pastoral Team 10% share, split seven ways. Percentages come from the
// workbook's "BD Per Revised" B5:B12 — the variant actually in force, confirmed
// by "Expense Monthly Sum" B4:B13 matching it rather than the two older plans.
// Worship/Prayer/Music is one line at 25%, as in BD Per Revised, Feb25 and
// Mar25; only the older Jan25 sheet splits it three ways.
const PASTORAL_MINISTRIES = [
  { key: "ce", label: "CE", pct: 0.1 },
  { key: "worship_prayer_music", label: "Worship/Prayer/Music", pct: 0.25 },
  { key: "mission_evangelism", label: "Mission/Evangelism", pct: 0.15 },
  { key: "discipleship_fellowship", label: "Discipleship/Fellowship", pct: 0.1 },
  { key: "admin_finance", label: "Admin & Finance", pct: 0.1 },
  { key: "benevolence", label: "Benevolence", pct: 0.25 },
  { key: "pastoral_care", label: "Pastoral Care", pct: 0.05 },
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

// Sunday-anchored week columns, mirroring the workbook's Weekly Collection sheet.
// UTC throughout: `new Date("2025-01-08").getDay()` reads local time and can
// shift a day in a negative-offset zone, which would file a Sunday under the
// previous week.
function sundaysIn(year) {
  const y = Number(year);
  const out = [];
  const d = new Date(Date.UTC(y, 0, 1));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCFullYear() === y) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Index of the Sunday on or before the date. Dates before the year's first
// Sunday (1-4 Jan in most years) clamp into the first column rather than being
// dropped — the workbook's hand-entry had nowhere to put them.
function weekIndexFor(dateVal, sundays) {
  if (!sundays || !sundays.length) return null;
  const iso = dateString(dateVal);
  const first = Date.parse(`${sundays[0]}T00:00:00Z`);
  const days = Math.floor((Date.parse(`${iso}T00:00:00Z`) - first) / 86400000);
  const idx = Math.floor(days / 7);
  if (idx < 0) return 0;
  if (idx > sundays.length - 1) return sundays.length - 1;
  return idx;
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

function buildSummary(colAgg, expAgg) {
  const net = colAgg.monthlyTotals.map((c, i) => round2(c - expAgg.monthlyTotals[i]));
  const runningBalance = [];
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    acc = round2(acc + net[i]);
    runningBalance.push(acc);
  }

  const sumArr = (arr) => round2(arr.reduce((a, b) => a + b, 0));

  // Deliberately NOT rounded: the seven percentages sum to 1.00, so unrounded
  // ministry months sum exactly to the Pastoral Team row. Rounding each would
  // leave a centavo residue against the parent.
  const ministryChildren = PASTORAL_MINISTRIES.map((m) => ({
    label: m.label,
    pct: `${m.pct * 100}%`,
    months: colAgg.shares.pastoral.map((v) => v * m.pct),
    total: sumArr(colAgg.shares.pastoral) * m.pct,
  }));

  const fundAllocation = [
    { label: "PBCM/PDOT Share", pct: "10%", months: colAgg.shares.pbcm, total: sumArr(colAgg.shares.pbcm) },
    {
      label: "Pastoral Team",
      pct: "10%",
      months: colAgg.shares.pastoral,
      total: sumArr(colAgg.shares.pastoral),
      children: ministryChildren,
    },
    { label: "Operational Fund", pct: "80%", months: colAgg.shares.operational, total: sumArr(colAgg.shares.operational) },
  ];

  // Section order matches fundAllocation order: PBCM, Pastoral, Operational
  const spentPerFund = expAgg.sections.map((s) =>
    round2(s.rows.reduce((sum, r) => sum + r.total, 0))
  );
  const fundPosition = fundAllocation.map((f, i) => ({
    label: f.label,
    allocated: f.total,
    spent: spentPerFund[i],
    remaining: round2(f.total - spentPerFund[i]),
  }));

  return {
    monthlyOverview: {
      collections: colAgg.monthlyTotals,
      expenses: expAgg.monthlyTotals,
      net,
      runningBalance,
    },
    fundAllocation,
    fundPosition,
    totals: {
      collections: colAgg.grandTotal,
      expenses: expAgg.grandTotal,
      net: round2(colAgg.grandTotal - expAgg.grandTotal),
    },
  };
}

function colLetter(idx) {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const syncStamp = (syncedAt) => `Last synced from StewardBox on ${syncedAt}`;

function buildSummaryGrid(year, summary, syncedAt) {
  const { monthlyOverview: mo, fundAllocation, fundPosition } = summary;

  // A running balance carries forward through months with no activity, which is
  // correct for a year that has happened but reads as real data in months that
  // have not. Trim it at the current month for the year in progress; a finished
  // year still reports all twelve.
  const now = new Date();
  const lastReportableMonth = Number(year) === now.getFullYear() ? now.getMonth() : 11;
  const runningBalance = mo.runningBalance.map((bal, i) =>
    i <= lastReportableMonth ? bal : ""
  );

  const values = [];
  const boldRows = [];
  const currencyRanges = [];
  // push returns the 0-based index of the row just added; +1 gives its sheet row
  const push = (row) => values.push(row) - 1;
  const pushBold = (row) => {
    const i = push(row);
    boldRows.push(i);
    return i;
  };

  pushBold([`SBCC FINANCIAL REPORT ${year}`]);
  push([syncStamp(syncedAt)]);
  push([]);

  pushBold(["MONTHLY OVERVIEW", ...MONTHS, "Total"]);
  const colIdx = push(["Total Collections", ...mo.collections, ""]);
  const colRow = colIdx + 1;
  values[colIdx][13] = `=SUM(B${colRow}:M${colRow})`;
  const expIdx = push(["Total Expenses", ...mo.expenses, ""]);
  const expRow = expIdx + 1;
  values[expIdx][13] = `=SUM(B${expRow}:M${expRow})`;
  push([
    "Net Surplus/(Deficit)",
    ...MONTHS.map((_, i) => `=${colLetter(i + 1)}${colRow}-${colLetter(i + 1)}${expRow}`),
    `=N${colRow}-N${expRow}`,
  ]);
  push(["Running Balance", ...runningBalance, ""]);
  currencyRanges.push({
    startRowIndex: colIdx,
    endRowIndex: values.length,
    startColumnIndex: 1,
    endColumnIndex: 14,
  });

  push([]);
  pushBold(["FUND ALLOCATION (from General Tithes & Offering)"]);
  pushBold(["Fund", "Share", ...MONTHS, "Total"]);
  const allocStart = values.length;
  fundAllocation.forEach((f) => {
    const i = push([f.label, f.pct, ...f.months, ""]);
    values[i][14] = `=SUM(C${i + 1}:N${i + 1})`;
    // Three leading spaces give the indent without cell-level formatting
    (f.children || []).forEach((c) => {
      const ci = push([`   ${c.label}`, c.pct, ...c.months, ""]);
      values[ci][14] = `=SUM(C${ci + 1}:N${ci + 1})`;
    });
  });
  currencyRanges.push({
    startRowIndex: allocStart,
    endRowIndex: values.length,
    startColumnIndex: 2,
    endColumnIndex: 15,
  });

  push([]);
  pushBold(["FUND POSITION (Year to Date)"]);
  pushBold(["Fund", "Allocated", "Spent", "Remaining"]);
  const posStart = values.length;
  fundPosition.forEach((f) => {
    const i = push([f.label, f.allocated, f.spent, ""]);
    values[i][3] = `=B${i + 1}-C${i + 1}`;
  });
  currencyRanges.push({
    startRowIndex: posStart,
    endRowIndex: values.length,
    startColumnIndex: 1,
    endColumnIndex: 4,
  });

  return {
    title: `${year} Summary`,
    values,
    fmt: { frozenRowCount: 0, boldRows, currencyRanges },
  };
}

function buildCollectionsGrid(year, colAgg, syncedAt) {
  const values = [["Category", ...MONTHS, "Total"]];
  colAgg.categories.forEach((cat) => {
    const r = values.length + 1;
    values.push([cat.label, ...cat.months, `=SUM(B${r}:M${r})`]);
  });
  const lastDataRow = values.length;          // 1-based sheet row of last category
  const totalIdx = values.length;             // 0-based index of totals row
  const totalRow = ["Total"];
  for (let c = 1; c <= 13; c++) {
    const L = colLetter(c);
    totalRow.push(`=SUM(${L}2:${L}${lastDataRow})`);
  }
  values.push(totalRow);
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Collections`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0, totalIdx],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 14 },
      ],
    },
  };
}

function buildExpensesGrid(year, expAgg, syncedAt) {
  const values = [["Category", "Monthly Budget", ...MONTHS, "Actual Total", "Annual Budget", "Variance"]];
  const sectionRowIdxs = [];
  for (const section of expAgg.sections) {
    sectionRowIdxs.push(values.length);
    values.push([section.label]);
    for (const row of section.rows) {
      const r = values.length + 1;
      values.push([
        row.label,
        row.monthlyBudget == null ? "" : row.monthlyBudget,
        ...row.months,
        `=SUM(C${r}:N${r})`,
        row.annualBudget == null ? "" : row.annualBudget,
        row.annualBudget == null ? "" : `=P${r}-O${r}`,
      ]);
    }
  }
  const lastDataRow = values.length;          // 1-based sheet row of last category row
  const totalIdx = values.length;
  const tr = totalIdx + 1;
  const totalRow = ["Total"];
  for (let c = 1; c <= 16; c++) {
    const L = colLetter(c);
    // SUM over the whole block — text section rows are ignored by SUM
    totalRow.push(L === "Q" ? `=P${tr}-O${tr}` : `=SUM(${L}2:${L}${lastDataRow})`);
  }
  values.push(totalRow);
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Expenses`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0, ...sectionRowIdxs, totalIdx],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 17 },
      ],
    },
  };
}

function buildCollectionsDetailGrid(year, rows, syncedAt) {
  const values = [[
    "Date", "Particular", "Control #", "Payment Method",
    ...COLLECTION_CATEGORIES.map((c) => c.label),
    "Total",
  ]];
  for (const row of rows) {
    values.push([
      dateString(row.date),
      row.particular || "",
      row.control_number || "",
      row.payment_method || "",
      ...COLLECTION_CATEGORIES.map((c) => parseFloat(row[c.key]) || 0),
      parseFloat(row.total_amount) || 0,
    ]);
  }
  const lastRow = values.length;
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Collections Detail`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 4, endColumnIndex: 14 },
      ],
    },
  };
}

function buildExpensesDetailGrid(year, rows, syncedAt) {
  const values = [["Date", "Particular", "Forms #", "Cheque #", "Category", "Fund Source", "Amount"]];
  for (const row of rows) {
    values.push([
      dateString(row.date),
      row.particular || "",
      row.forms_number || "",
      row.cheque_number || "",
      row.category || "",
      row.fund_source || "",
      parseFloat(row.total_amount) || 0,
    ]);
  }
  const lastRow = values.length;
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Expenses Detail`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 6, endColumnIndex: 7 },
      ],
    },
  };
}

function buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows, expenseRows }, syncedAt) {
  return [
    buildSummaryGrid(year, summary, syncedAt),
    buildCollectionsGrid(year, colAgg, syncedAt),
    buildExpensesGrid(year, expAgg, syncedAt),
    buildCollectionsDetailGrid(year, collectionRows, syncedAt),
    buildExpensesDetailGrid(year, expenseRows, syncedAt),
  ];
}

module.exports = {
  MONTHS,
  COLLECTION_CATEGORIES,
  OPERATIONAL_EXPENSE_CATEGORIES,
  PASTORAL_MINISTRIES,
  round2,
  monthIndex,
  dateString,
  sundaysIn,
  weekIndexFor,
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
};
