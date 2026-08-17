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

const PASS_THRU_KEYS = [
  "sisterhood_san_juan",
  "sisterhood_labuin",
  "brotherhood",
  "youth",
  "couples",
  "sunday_school",
  "special_purpose_pledge",
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

function monthIndex(dateVal) {
  if (dateVal instanceof Date) return dateVal.getMonth();
  return parseInt(String(dateVal).slice(5, 7), 10) - 1;
}

function dateString(dateVal) {
  if (dateVal instanceof Date) return dateVal.toISOString().slice(0, 10);
  return String(dateVal).slice(0, 10);
}

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

const OPERATIONAL_SHARE = 0.8;

function buildOfferingTarget(colAgg, expAgg, year) {
  const opSection = (expAgg.sections || []).find((s) =>
    s.label.startsWith("Operational Fund")
  );
  if (!opSection) return null;
  const operationalBudget = opSection.rows.reduce(
    (sum, r) => sum + (r.monthlyBudget || 0),
    0
  );
  if (!operationalBudget) return null;

  const requiredMonthly = operationalBudget / OPERATIONAL_SHARE;
  const sundayCount = sundaysIn(year).length;
  const tithes = colAgg.categories.find((c) => c.key === "general_tithes_offering");

  return {
    operationalBudget: round2(operationalBudget),
    operationalPct: `${OPERATIONAL_SHARE * 100}%`,
    requiredMonthly: round2(requiredMonthly),
    requiredWeekly: round2((requiredMonthly * 12) / sundayCount),
    actualOffering: tithes ? tithes.months : zeros12(),
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

function buildSummaryGrid(year, summary, syncedAt, offeringTarget) {
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

  if (offeringTarget) {
    push([]);
    pushBold(["OFFERING TARGET"]);
    const budgetIdx = push(["Operational budget (monthly)", offeringTarget.operationalBudget]);
    push(["Operational share", offeringTarget.operationalPct]);
    const reqIdx = push(["Required monthly offering", offeringTarget.requiredMonthly]);
    push(["Required weekly offering", offeringTarget.requiredWeekly]);
    push([]);
    pushBold(["", ...MONTHS, "Total"]);
    const actualIdx = push(["Actual offering", ...offeringTarget.actualOffering, ""]);
    const actualRow = actualIdx + 1;
    values[actualIdx][13] = `=SUM(B${actualRow}:M${actualRow})`;
    const surplusIdx = push([
      "Surplus/(Shortfall)",
      ...MONTHS.map((_, i) => `=${colLetter(i + 1)}${actualRow}-$B$${reqIdx + 1}`),
      "",
    ]);
    values[surplusIdx][13] = `=SUM(B${surplusIdx + 1}:M${surplusIdx + 1})`;
    currencyRanges.push({ startRowIndex: budgetIdx, endRowIndex: budgetIdx + 1, startColumnIndex: 1, endColumnIndex: 2 });
    currencyRanges.push({ startRowIndex: reqIdx, endRowIndex: reqIdx + 2, startColumnIndex: 1, endColumnIndex: 2 });
    currencyRanges.push({ startRowIndex: actualIdx, endRowIndex: surplusIdx + 1, startColumnIndex: 1, endColumnIndex: 14 });
  }

  push([]);
  pushBold(["FUND ALLOCATION (from General Tithes & Offering)"]);
  pushBold(["Fund", "Share", ...MONTHS, "Total"]);
  const allocStart = values.length;
  fundAllocation.forEach((f) => {
    const i = push([f.label, f.pct, ...f.months, ""]);
    values[i][14] = `=SUM(C${i + 1}:N${i + 1})`;
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
  const byKey = {};
  colAgg.categories.forEach((c) => {
    byKey[c.key] = c;
  });

  const values = [];
  const boldRows = [];
  const push = (row) => values.push(row) - 1;
  const pushBold = (row) => {
    const i = push(row);
    boldRows.push(i);
    return i;
  };

  pushBold(["Category", ...MONTHS, "Total"]);
  const firstDataIdx = values.length;

  const catRow = (label, cat) => {
    const i = push([label, ...cat.months, ""]);
    values[i][13] = `=SUM(B${i + 1}:M${i + 1})`;
    return i + 1;
  };

  const tithesRow = catRow(byKey.general_tithes_offering.label, byKey.general_tithes_offering);
  const interestRow = catRow(byKey.bank_interest.label, byKey.bank_interest);

  pushBold(["PASS-THRU ACCOUNTS"]);
  const passFirstRow = values.length + 1;
  PASS_THRU_KEYS.forEach((k) => catRow(`   ${byKey[k].label}`, byKey[k]));
  const passLastRow = values.length;

  const subIdx = pushBold([
    "   Subtotal — Pass-Thru",
    ...MONTHS.map((_, i) => {
      const L = colLetter(i + 1);
      return `=SUM(${L}${passFirstRow}:${L}${passLastRow})`;
    }),
    "",
  ]);
  const subtotalRow = subIdx + 1;
  values[subIdx][13] = `=SUM(B${subtotalRow}:M${subtotalRow})`;

  const totalIdx = pushBold([
    "Total",
    ...MONTHS.map((_, i) => {
      const L = colLetter(i + 1);
      return `=${L}${tithesRow}+${L}${interestRow}+${L}${subtotalRow}`;
    }),
    "",
  ]);
  values[totalIdx][13] = `=SUM(B${totalIdx + 1}:M${totalIdx + 1})`;

  push([]);
  push([syncStamp(syncedAt)]);

  return {
    title: `${year} Collections`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows,
      currencyRanges: [
        { startRowIndex: firstDataIdx, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 14 },
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
  const offeringTarget = buildOfferingTarget(colAgg, expAgg, year);
  return [
    buildSummaryGrid(year, summary, syncedAt, offeringTarget),
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
  buildOfferingTarget,
  buildSheetGrids,
};
