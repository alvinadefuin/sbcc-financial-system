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

function buildSummary(colAgg, expAgg) {
  const net = colAgg.monthlyTotals.map((c, i) => round2(c - expAgg.monthlyTotals[i]));
  const runningBalance = [];
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    acc = round2(acc + net[i]);
    runningBalance.push(acc);
  }

  const sumArr = (arr) => round2(arr.reduce((a, b) => a + b, 0));
  const fundAllocation = [
    { label: "PBCM/PDOT Share", pct: "10%", months: colAgg.shares.pbcm, total: sumArr(colAgg.shares.pbcm) },
    { label: "Pastoral Team", pct: "10%", months: colAgg.shares.pastoral, total: sumArr(colAgg.shares.pastoral) },
    { label: "Operational Fund", pct: "80%", months: colAgg.shares.operational, total: sumArr(colAgg.shares.operational) },
  ];

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

const syncStamp = (syncedAt) => `Last synced from SBCC Financial System on ${syncedAt}`;

function buildSummaryGrid(year, summary, syncedAt) {
  const { monthlyOverview: mo, fundAllocation, fundPosition } = summary;
  const values = [
    [`SBCC FINANCIAL REPORT ${year}`],
    [syncStamp(syncedAt)],
    [],
    ["MONTHLY OVERVIEW", ...MONTHS, "Total"],
    ["Total Collections", ...mo.collections, "=SUM(B5:M5)"],
    ["Total Expenses", ...mo.expenses, "=SUM(B6:M6)"],
    ["Net Surplus/(Deficit)", ...MONTHS.map((_, i) => `=${colLetter(i + 1)}5-${colLetter(i + 1)}6`), "=N5-N6"],
    ["Running Balance", ...mo.runningBalance, ""],
    [],
    ["FUND ALLOCATION (from General Tithes & Offering)"],
    ["Fund", "Share", ...MONTHS, "Total"],
  ];
  fundAllocation.forEach((f) => {
    const r = values.length + 1;
    values.push([f.label, f.pct, ...f.months, `=SUM(C${r}:N${r})`]);
  });
  values.push([]);
  values.push(["FUND POSITION (Year to Date)"]);
  values.push(["Fund", "Allocated", "Spent", "Remaining"]);
  fundPosition.forEach((f) => {
    const r = values.length + 1;
    values.push([f.label, f.allocated, f.spent, `=B${r}-C${r}`]);
  });
  return {
    title: `${year} Summary`,
    values,
    fmt: {
      frozenRowCount: 0,
      boldRows: [0, 3, 9, 10, 15, 16],
      currencyRanges: [
        { startRowIndex: 4, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 14 },
        { startRowIndex: 11, endRowIndex: 14, startColumnIndex: 2, endColumnIndex: 15 },
        { startRowIndex: 17, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 4 },
      ],
    },
  };
}

function buildCollectionsGrid(year, colAgg, syncedAt) {
  const values = [["Category", ...MONTHS, "Total"]];
  colAgg.categories.forEach((cat) => {
    const r = values.length + 1;
    values.push([cat.label, ...cat.months, `=SUM(B${r}:M${r})`]);
  });
  const lastDataRow = values.length;
  const totalIdx = values.length;
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
  const lastDataRow = values.length;
  const totalIdx = values.length;
  const tr = totalIdx + 1;
  const totalRow = ["Total"];
  for (let c = 1; c <= 16; c++) {
    const L = colLetter(c);
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
  round2,
  monthIndex,
  dateString,
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
};
