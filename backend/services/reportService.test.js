const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
  sundaysIn,
  weekIndexFor,
  PASTORAL_MINISTRIES,
  buildOfferingTarget,
  aggregateWeekly,
} = require("./reportService");

// Fixture: a collection row with all amount columns zeroed
const col = (date, fields = {}) => ({
  date,
  total_amount: 0,
  general_tithes_offering: 0, bank_interest: 0,
  sisterhood_san_juan: 0, sisterhood_labuin: 0, brotherhood: 0,
  youth: 0, couples: 0, sunday_school: 0, special_purpose_pledge: 0,
  pbcm_share: 0, pastoral_team_share: 0, operational_fund_share: 0,
  ...fields,
});

describe("aggregateCollections", () => {
  test("sums categories into month buckets with totals", () => {
    const rows = [
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800 }),
      col("2025-01-19", { general_tithes_offering: 500, youth: 50, total_amount: 550, pbcm_share: 50, pastoral_team_share: 50, operational_fund_share: 400 }),
      col("2025-03-02", { sunday_school: 200, total_amount: 200 }),
    ];
    const agg = aggregateCollections(rows);

    const gto = agg.categories.find((c) => c.key === "general_tithes_offering");
    expect(gto.label).toBe("General Tithes & Offering");
    expect(gto.months[0]).toBe(1500);   // Jan
    expect(gto.months[2]).toBe(0);      // Mar
    expect(gto.total).toBe(1500);

    const ss = agg.categories.find((c) => c.key === "sunday_school");
    expect(ss.months[2]).toBe(200);

    expect(agg.categories).toHaveLength(9);
    expect(agg.monthlyTotals[0]).toBe(1550);
    expect(agg.monthlyTotals[2]).toBe(200);
    expect(agg.grandTotal).toBe(1750);

    expect(agg.shares.pbcm[0]).toBe(150);
    expect(agg.shares.pastoral[0]).toBe(150);
    expect(agg.shares.operational[0]).toBe(1200);
  });

  test("handles Date objects (PostgreSQL returns Date for DATE columns)", () => {
    const agg = aggregateCollections([
      col(new Date(2025, 2, 15), { bank_interest: 33.33, total_amount: 33.33 }),
    ]);
    expect(agg.categories.find((c) => c.key === "bank_interest").months[2]).toBe(33.33);
  });

  test("empty input produces zeroed structure", () => {
    const agg = aggregateCollections([]);
    expect(agg.grandTotal).toBe(0);
    expect(agg.monthlyTotals).toEqual(Array(12).fill(0));
    expect(agg.categories.every((c) => c.total === 0)).toBe(true);
  });
});

const exp = (date, fields = {}) => ({
  date,
  total_amount: 0,
  fund_source: "operational",
  pbcm_share_expense: 0, pastoral_worker_support: 0, cap_assistance: 0,
  honorarium: 0, conference_seminar: 0, fellowship_events: 0,
  anniversary_christmas: 0, supplies: 0, utilities: 0,
  vehicle_maintenance: 0, lto_registration: 0, transportation_gas: 0,
  building_maintenance: 0, abccop_national: 0, cbcc_share: 0,
  kabalikat_share: 0, abccop_community: 0,
  ...fields,
});

describe("aggregateExpenses", () => {
  const budgetRows = [
    { category: "PBCM Share/PDOT", subcategory: "PBCM Share", budget_amount: 9500 },
    { category: "Pastoral Team", subcategory: "Pastoral Team", budget_amount: 9500 },
    { category: "Operational Fund", subcategory: "Utilities", budget_amount: 15000 },
  ];

  test("groups into three fund sections with budget matching", () => {
    const rows = [
      exp("2025-01-10", { utilities: 500, supplies: 250, total_amount: 750 }),
      exp("2025-01-20", { pbcm_share_expense: 39800, total_amount: 39800 }),
      exp("2025-02-14", { fund_source: "pastoral_team", total_amount: 1200 }),
    ];
    const agg = aggregateExpenses(rows, budgetRows);

    expect(agg.sections.map((s) => s.label)).toEqual([
      "PBCM Share/PDOT (10%)",
      "Pastoral Team (10%)",
      "Operational Fund (80%)",
    ]);

    const pbcm = agg.sections[0].rows[0];
    expect(pbcm.months[0]).toBe(39800);
    expect(pbcm.monthlyBudget).toBe(9500);
    expect(pbcm.annualBudget).toBe(114000);
    expect(pbcm.variance).toBe(114000 - 39800);

    const pastoral = agg.sections[1].rows[0];
    expect(pastoral.months[1]).toBe(1200);
    expect(pastoral.total).toBe(1200);

    const utilities = agg.sections[2].rows.find((r) => r.key === "utilities");
    expect(utilities.months[0]).toBe(500);
    expect(utilities.monthlyBudget).toBe(15000);
    expect(utilities.annualBudget).toBe(180000);
    expect(utilities.variance).toBe(179500);

    const suppliesRow = agg.sections[2].rows.find((r) => r.key === "supplies");
    expect(suppliesRow.monthlyBudget).toBeNull();   // no budget row seeded
    expect(suppliesRow.annualBudget).toBeNull();
    expect(suppliesRow.variance).toBeNull();

    expect(agg.sections[2].rows).toHaveLength(16);
    expect(agg.monthlyTotals[0]).toBe(40550);
    expect(agg.monthlyTotals[1]).toBe(1200);
    expect(agg.grandTotal).toBe(41750);
  });

  test("no budget rows → all budget fields null", () => {
    const agg = aggregateExpenses([exp("2025-04-01", { honorarium: 100, total_amount: 100 })], []);
    expect(agg.sections[2].rows.find((r) => r.key === "honorarium").monthlyBudget).toBeNull();
  });
});

describe("buildSummary", () => {
  test("computes overview, allocation, and fund position", () => {
    const colAgg = aggregateCollections([
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800 }),
      col("2025-02-02", { general_tithes_offering: 2000, total_amount: 2000, pbcm_share: 200, pastoral_team_share: 200, operational_fund_share: 1600 }),
    ]);
    const expAgg = aggregateExpenses([
      exp("2025-01-10", { utilities: 600, total_amount: 600 }),
      exp("2025-02-14", { pbcm_share_expense: 50, total_amount: 50 }),
    ], []);

    const s = buildSummary(colAgg, expAgg);

    expect(s.monthlyOverview.collections[0]).toBe(1000);
    expect(s.monthlyOverview.expenses[0]).toBe(600);
    expect(s.monthlyOverview.net[0]).toBe(400);
    expect(s.monthlyOverview.net[1]).toBe(1950);
    expect(s.monthlyOverview.runningBalance[0]).toBe(400);
    expect(s.monthlyOverview.runningBalance[1]).toBe(2350);
    expect(s.monthlyOverview.runningBalance[11]).toBe(2350);

    expect(s.fundAllocation).toHaveLength(3);
    expect(s.fundAllocation[0]).toMatchObject({ label: "PBCM/PDOT Share", pct: "10%", total: 300 });
    expect(s.fundAllocation[2]).toMatchObject({ label: "Operational Fund", pct: "80%", total: 2400 });

    // fund position: spent comes from the matching expense section totals
    expect(s.fundPosition[0]).toEqual({ label: "PBCM/PDOT Share", allocated: 300, spent: 50, remaining: 250 });
    expect(s.fundPosition[2]).toEqual({ label: "Operational Fund", allocated: 2400, spent: 600, remaining: 1800 });

    expect(s.totals).toEqual({ collections: 3000, expenses: 650, net: 2350 });
  });
});

describe("buildSheetGrids", () => {
  const SYNCED = "6/11/2026, 3:42:00 PM";

  function makeGrids() {
    const collections = [
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800, particular: "Sunday Service", control_number: "C-001", payment_method: "Cash" }),
    ];
    const expenses = [
      exp("2025-01-10", { utilities: 600, total_amount: 600, particular: "Meralco", forms_number: "F-01", cheque_number: "", category: "Operational Fund" }),
    ];
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses(expenses, [
      { category: "Operational Fund", subcategory: "Utilities", budget_amount: 15000 },
    ]);
    const summary = buildSummary(colAgg, expAgg);
    return buildSheetGrids(2025, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: expenses }, SYNCED);
  }

  test("returns 6 grids with year-prefixed titles in order", () => {
    expect(makeGrids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
      "2025 Weekly",
    ]);
  });

  test("collections grid: header, SUM formulas, totals row, sync stamp", () => {
    const grid = makeGrids()[1];
    expect(grid.values[0]).toEqual(["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[1][0]).toBe("General Tithes & Offering");
    expect(grid.values[1][1]).toBe(1000);
    expect(grid.values[1][13]).toBe("=SUM(B2:M2)");
    const totalIdx = grid.values.findIndex((r) => r[0] === "Total");
    expect(grid.values[totalIdx][1]).toBe("=B2+B3+B12");
    expect(grid.values[totalIdx][13]).toBe(`=SUM(B${totalIdx + 1}:M${totalIdx + 1})`);
    expect(grid.values[grid.values.length - 1][0]).toContain(SYNCED);
    expect(grid.fmt.frozenRowCount).toBe(1);
    expect(grid.fmt.boldRows).toEqual([0, 3, 11, 12]);
  });

  test("expenses grid: section rows, budget columns, variance formulas", () => {
    const grid = makeGrids()[2];
    expect(grid.values[0]).toEqual(["Category", "Monthly Budget", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Actual Total", "Annual Budget", "Variance"]);
    expect(grid.values[1]).toEqual(["PBCM Share/PDOT (10%)"]);          // section header
    expect(grid.values[2][0]).toBe("PBCM Share/PDOT");                  // sheet row 3
    expect(grid.values[2][14]).toBe("=SUM(C3:N3)");
    expect(grid.values[3]).toEqual(["Pastoral Team (10%)"]);
    expect(grid.values[5]).toEqual(["Operational Fund (80%)"]);
    const utilRowIdx = grid.values.findIndex((r) => r[0] === "Utilities");
    const sheetRow = utilRowIdx + 1;
    expect(grid.values[utilRowIdx][1]).toBe(15000);
    expect(grid.values[utilRowIdx][15]).toBe(180000);
    expect(grid.values[utilRowIdx][16]).toBe(`=P${sheetRow}-O${sheetRow}`);
    // totals row: first cell "Total", monthly sums span all data rows
    const totalIdx = grid.values.findIndex((r) => r[0] === "Total");
    expect(grid.values[totalIdx][2]).toBe(`=SUM(C2:C${totalIdx})`);
  });

  test("summary grid: title, overview formulas, fund position", () => {
    const grid = makeGrids()[0];
    expect(grid.values[0][0]).toBe("SBCC FINANCIAL REPORT 2025");
    expect(grid.values[1][0]).toContain(SYNCED);
    expect(grid.values[3][0]).toBe("MONTHLY OVERVIEW");
    expect(grid.values[4][0]).toBe("Total Collections");
    expect(grid.values[4][13]).toBe("=SUM(B5:M5)");
    expect(grid.values[6][1]).toBe("=B5-B6");
    expect(grid.values[20]).toEqual(["Fund", "Share", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[21][0]).toBe("PBCM/PDOT Share");
    expect(grid.values[21][14]).toBe("=SUM(C22:N22)");
    expect(grid.values[33]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[34][3]).toBe("=B35-C35");
  });

  test("summary grid formatting covers every rendered block", () => {
    const grid = makeGrids()[0];
    expect(grid.fmt.boldRows[0]).toBe(0);
    expect(grid.fmt.currencyRanges).toHaveLength(6);
    grid.fmt.currencyRanges.forEach((r) => {
      expect(r.endRowIndex).toBeGreaterThan(r.startRowIndex);
      expect(r.endRowIndex).toBeLessThanOrEqual(grid.values.length);
    });
  });

  test("detail grids: one row per record with date strings", () => {
    const grids = makeGrids();
    const colDetail = grids[3];
    expect(colDetail.values[0].slice(0, 4)).toEqual(["Date", "Particular", "Control #", "Payment Method"]);
    expect(colDetail.values[1][0]).toBe("2025-01-05");
    expect(colDetail.values[1][1]).toBe("Sunday Service");
    expect(colDetail.values[1][13]).toBe(1000); // Total column
    const expDetail = grids[4];
    expect(expDetail.values[0]).toEqual(["Date", "Particular", "Forms #", "Cheque #", "Category", "Fund Source", "Amount"]);
    expect(expDetail.values[1]).toEqual(["2025-01-10", "Meralco", "F-01", "", "Operational Fund", "operational", 600]);
  });
});

// A running balance carried into months that have not happened yet reads as
// real data: with one August collection, Sep–Dec showed the August balance on a
// sheet that otherwise had nothing in them. Trim it at the current month for
// the year in progress; a finished year still reports all twelve.
describe("running balance stops at the current month", () => {
  const SYNCED = "8/16/2026, 5:25:40 PM";

  const gridFor = (year, collectionDate) => {
    const collections = [
      col(collectionDate, { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800 }),
    ];
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    const summary = buildSummary(colAgg, expAgg);
    const grids = buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] }, SYNCED);
    return grids[0].values;
  };

  // Row 8 of the summary grid: ["Running Balance", ...12 months, total]
  const balanceMonths = (values) => values[7].slice(1, 13);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-16T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("the year in progress leaves months after the current one blank", () => {
    const months = balanceMonths(gridFor(2026, "2026-08-10"));

    expect(months[7]).toBe(1000);          // August, the current month
    expect(months.slice(8)).toEqual(["", "", "", ""]);  // Sep–Dec
  });

  test("months before the current one still carry the balance forward", () => {
    const months = balanceMonths(gridFor(2026, "2026-02-10"));

    // February onward carries 1000 through to the current month, unchanged.
    expect(months[0]).toBe(0);
    expect(months[1]).toBe(1000);
    expect(months[6]).toBe(1000);
    expect(months[7]).toBe(1000);
  });

  test("a finished year still reports all twelve months", () => {
    const months = balanceMonths(gridFor(2025, "2025-01-05"));

    expect(months).toHaveLength(12);
    expect(months.every((m) => m !== "")).toBe(true);
    expect(months[11]).toBe(1000);
  });
});

// The app is branded StewardBox everywhere a person sees it; the sheet was the
// last place still naming the repo. Every tab carries this stamp.
describe("sync stamp branding", () => {
  const SYNCED = "8/16/2026, 5:56:03 PM";

  test("every tab names the product as StewardBox", () => {
    const collections = [col("2026-08-10", { general_tithes_offering: 1000, total_amount: 1000 })];
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    const summary = buildSummary(colAgg, expAgg);
    const grids = buildSheetGrids(2026, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] }, SYNCED);

    const stamps = grids
      .flatMap((g) => g.values)
      .map((row) => row[0])
      .filter((cell) => typeof cell === "string" && cell.startsWith("Last synced"));

    // One per tab: Summary, Collections, Expenses, both Details, and Weekly
    expect(stamps).toHaveLength(6);
    stamps.forEach((stamp) => {
      expect(stamp).toBe(`Last synced from StewardBox on ${SYNCED}`);
    });
  });
});

describe("sundaysIn", () => {
  test("2025 has 52 Sundays starting 5 January", () => {
    const s = sundaysIn(2025);
    expect(s).toHaveLength(52);
    expect(s[0]).toBe("2025-01-05");
    expect(s[51]).toBe("2025-12-28");
  });

  test("a year beginning on a Sunday has 53", () => {
    const s = sundaysIn(2023);
    expect(s).toHaveLength(53);
    expect(s[0]).toBe("2023-01-01");
    expect(s[52]).toBe("2023-12-31");
  });

  test("a leap year is enumerated correctly", () => {
    const s = sundaysIn(2024);
    expect(s[0]).toBe("2024-01-07");
    expect(s.every((d) => d.startsWith("2024-"))).toBe(true);
  });

  test("accepts the year as a string", () => {
    expect(sundaysIn("2025")).toHaveLength(52);
  });
});

describe("weekIndexFor", () => {
  const sundays = sundaysIn(2025);

  test("a Sunday maps to its own column", () => {
    expect(weekIndexFor("2025-01-05", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-12", sundays)).toBe(1);
  });

  test("a midweek date maps to the Sunday on or before it", () => {
    expect(weekIndexFor("2025-01-08", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-11", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-15", sundays)).toBe(1);
  });

  test("a date before the first Sunday clamps to the first column", () => {
    expect(weekIndexFor("2025-01-01", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-04", sundays)).toBe(0);
  });

  test("the last days of the year clamp to the last column", () => {
    expect(weekIndexFor("2025-12-31", sundays)).toBe(51);
  });

  test("accepts a Date object, as PostgreSQL returns for DATE columns", () => {
    expect(weekIndexFor(new Date("2025-01-08T00:00:00Z"), sundays)).toBe(0);
  });
});

describe("pastoral ministry allocation", () => {
  const collections = [
    col("2025-01-05", {
      general_tithes_offering: 88817,
      total_amount: 88817,
      pbcm_share: 8881.7,
      pastoral_team_share: 8881.7,
      operational_fund_share: 71053.6,
    }),
  ];

  test("the seven percentages sum to exactly 1", () => {
    const sum = PASTORAL_MINISTRIES.reduce((a, m) => a + m.pct, 0);
    expect(sum).toBe(1);
  });

  test("Pastoral Team carries seven children in workbook order", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const pastoral = summary.fundAllocation.find((f) => f.label === "Pastoral Team");
    expect(pastoral.children.map((c) => c.label)).toEqual([
      "CE",
      "Worship/Prayer/Music",
      "Mission/Evangelism",
      "Discipleship/Fellowship",
      "Admin & Finance",
      "Benevolence",
      "Pastoral Care",
    ]);
    expect(pastoral.children.map((c) => c.pct)).toEqual([
      "10%", "25%", "15%", "10%", "10%", "25%", "5%",
    ]);
  });

  test("children sum exactly to the parent, month by month", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const pastoral = summary.fundAllocation.find((f) => f.label === "Pastoral Team");
    for (let m = 0; m < 12; m++) {
      const kids = pastoral.children.reduce((a, c) => a + c.months[m], 0);
      expect(kids).toBeCloseTo(pastoral.months[m], 10);
    }
  });

  test("January figures match the workbook's =$G$3*B5 derivation", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const kids = summary.fundAllocation.find((f) => f.label === "Pastoral Team").children;
    expect(kids[0].months[0]).toBeCloseTo(888.17, 2);   // CE 10%
    expect(kids[1].months[0]).toBeCloseTo(2220.425, 3); // Worship/Prayer/Music 25%
    expect(kids[6].months[0]).toBeCloseTo(444.085, 3);  // Pastoral Care 5%
  });

  test("the other two funds carry no children", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    expect(summary.fundAllocation[0].children).toBeUndefined();
    expect(summary.fundAllocation[2].children).toBeUndefined();
  });

  test("ministry rows render indented under Pastoral Team with SUM totals", () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    const summary = buildSummary(colAgg, expAgg);
    const grid = buildSheetGrids(
      2025,
      { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[0];
    const parentIdx = grid.values.findIndex((r) => r[0] === "Pastoral Team");
    expect(grid.values[parentIdx + 1][0]).toBe("   CE");
    expect(grid.values[parentIdx + 1][1]).toBe("10%");
    const sheetRow = parentIdx + 2;
    expect(grid.values[parentIdx + 1][14]).toBe(`=SUM(C${sheetRow}:N${sheetRow})`);
    expect(grid.values[parentIdx + 7][0]).toBe("   Pastoral Care");
    expect(grid.values[parentIdx + 8][0]).toBe("Operational Fund");
  });
});

describe("offering target", () => {
  // The workbook's 16 operational lines, summing to 87,933.33 (BD Per Revised E13)
  const OPERATIONAL_BUDGET = [
    ["Pastoral & Worker Support", 31291.67], ["CAP-Churches Assistance Program", 1000],
    ["Honorarium", 7000], ["Conference/Seminar/Retreat/Assembly", 1000],
    ["Fellowship Events", 1275], ["Anniversary/Christmas Events", 14833.33],
    ["Supplies", 3000], ["Utilities", 15000], ["Vehicle Maintenance", 5000],
    ["LTO Registration", 416.67], ["Transportation & Gas", 3500],
    ["Building Maintenance", 3000], ["ABCCOP National", 400],
    ["CBCC Share", 600], ["Kabalikat Share", 200], ["ABCCOP Community Day", 416.67],
  ].map(([subcategory, budget_amount]) => ({
    category: "Operational Fund",
    subcategory,
    budget_amount,
  }));

  const collections = [
    col("2025-01-05", { general_tithes_offering: 88817, total_amount: 88817 }),
  ];

  const gridFor = (budgetRows) => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], budgetRows);
    const summary = buildSummary(colAgg, expAgg);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[0];
  };

  test("required monthly offering matches the workbook's 109,916.67", () => {
    const target = buildOfferingTarget(
      aggregateCollections(collections),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.operationalBudget).toBeCloseTo(87933.34, 2);
    expect(target.requiredMonthly).toBeCloseTo(109916.67, 2);
  });

  test("required weekly offering divides the annual requirement by the year's Sundays", () => {
    const target = buildOfferingTarget(
      aggregateCollections(collections),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.requiredWeekly).toBeCloseTo((109916.67 * 12) / 52, 1);
  });

  test("actual offering is general tithes only, never the grand total", () => {
    const withPassThru = [
      col("2025-02-02", {
        general_tithes_offering: 100,
        sunday_school: 900,
        total_amount: 1000,
      }),
    ];
    const target = buildOfferingTarget(
      aggregateCollections(withPassThru),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.actualOffering[1]).toBe(100);
  });

  test("returns null when the year has no budget rows", () => {
    expect(
      buildOfferingTarget(aggregateCollections(collections), aggregateExpenses([], []), 2025)
    ).toBeNull();
  });

  test("the block renders between the overview and the fund allocation", () => {
    const grid = gridFor(OPERATIONAL_BUDGET);
    const idx = grid.values.findIndex((r) => r[0] === "OFFERING TARGET");
    expect(idx).toBeGreaterThan(grid.values.findIndex((r) => r[0] === "MONTHLY OVERVIEW"));
    expect(idx).toBeLessThan(
      grid.values.findIndex((r) => r[0] === "FUND ALLOCATION (from General Tithes & Offering)")
    );
    expect(grid.values[idx + 1][0]).toBe("Operational budget (monthly)");
    expect(grid.values[idx + 2]).toEqual(["Operational share", "80%"]);
    expect(grid.values[idx + 3][0]).toBe("Required monthly offering");
    expect(grid.values[idx + 4][0]).toBe("Required weekly offering");
  });

  test("surplus is actual minus the required monthly figure, per month", () => {
    const grid = gridFor(OPERATIONAL_BUDGET);
    const reqIdx = grid.values.findIndex((r) => r[0] === "Required monthly offering");
    const actualIdx = grid.values.findIndex((r) => r[0] === "Actual offering");
    const surplusIdx = grid.values.findIndex((r) => r[0] === "Surplus/(Shortfall)");
    expect(grid.values[surplusIdx][1]).toBe(`=B${actualIdx + 1}-$B$${reqIdx + 1}`);
  });

  test("the block is omitted entirely when there is no budget", () => {
    const grid = gridFor([]);
    expect(grid.values.some((r) => r[0] === "OFFERING TARGET")).toBe(false);
  });
});

describe("collections pass-thru grouping", () => {
  const collections = [
    col("2025-01-05", {
      general_tithes_offering: 1000,
      bank_interest: 50,
      sunday_school: 200,
      sisterhood_san_juan: 100,
      total_amount: 1350,
    }),
  ];

  const grid = () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[1];
  };

  test("allocatable rows come first, then the pass-thru group", () => {
    const g = grid();
    expect(g.values[1][0]).toBe("General Tithes & Offering");
    expect(g.values[2][0]).toBe("Bank Interest");
    expect(g.values[3]).toEqual(["PASS-THRU ACCOUNTS"]);
    expect(g.values[4][0]).toBe("   Sisterhood San Juan");
    expect(g.values[10][0]).toBe("   Special/Pledge");
  });

  test("the pass-thru subtotal spans only the pass-thru rows", () => {
    const g = grid();
    const idx = g.values.findIndex((r) => r[0] === "   Subtotal — Pass-Thru");
    expect(g.values[idx][1]).toBe("=SUM(B5:B11)");
    expect(g.values[idx][13]).toBe(`=SUM(B${idx + 1}:M${idx + 1})`);
  });

  test("the Total row adds the three group rows and never re-counts the subtotal", () => {
    const g = grid();
    const subtotalRow = g.values.findIndex((r) => r[0] === "   Subtotal — Pass-Thru") + 1;
    const idx = g.values.findIndex((r) => r[0] === "Total");
    expect(g.values[idx][1]).toBe(`=B2+B3+B${subtotalRow}`);
    expect(g.values[idx][13]).toBe(`=SUM(B${idx + 1}:M${idx + 1})`);
  });

  test("the Total equals the sum of every category exactly once", () => {
    // Guards the double-count this layout invites: 1000 + 50 + (100 + 200) = 1350
    const g = grid();
    const idx = g.values.findIndex((r) => r[0] === "Total");
    expect(g.values[idx][1]).toBe("=B2+B3+B12");
    expect(g.values[1][1] + g.values[2][1] + g.values[4][1] + g.values[9][1]).toBe(1350);
  });

  test("all nine categories still appear, none dropped by the regrouping", () => {
    const g = grid();
    const labels = g.values.map((r) => (r[0] || "").trim());
    [
      "General Tithes & Offering", "Bank Interest", "Sisterhood San Juan",
      "Sisterhood Labuin", "Brotherhood", "Youth", "Couples",
      "Sunday School", "Special/Pledge",
    ].forEach((l) => expect(labels).toContain(l));
  });

  test("the header and group rows are bold and the sync stamp is last", () => {
    const g = grid();
    expect(g.fmt.frozenRowCount).toBe(1);
    expect(g.fmt.boldRows).toContain(0);
    expect(g.fmt.boldRows).toContain(3);
    expect(g.values[g.values.length - 1][0]).toContain("StewardBox");
  });
});

describe("weekly aggregation", () => {
  const collections = [
    col("2025-01-05", { general_tithes_offering: 32685, total_amount: 32685, pbcm_share: 3268.5, pastoral_team_share: 3268.5, operational_fund_share: 26148 }),
    col("2025-01-08", { sunday_school: 100, total_amount: 100 }),
    col("2025-01-12", { general_tithes_offering: 16560, total_amount: 16560, pbcm_share: 1656, pastoral_team_share: 1656, operational_fund_share: 13248 }),
    col("2025-01-02", { general_tithes_offering: 500, total_amount: 500 }),
  ];

  test("one column per Sunday in the year", () => {
    const agg = aggregateWeekly(collections, 2025);
    expect(agg.sundays).toHaveLength(52);
    expect(agg.categories[0].weeks).toHaveLength(52);
  });

  test("a midweek record lands in its own week's column", () => {
    const agg = aggregateWeekly(collections, 2025);
    const school = agg.categories.find((c) => c.key === "sunday_school");
    expect(school.weeks[0]).toBe(100);
    expect(school.weeks[1]).toBe(0);
  });

  test("a pre-first-Sunday record folds into the first column, never dropped", () => {
    const agg = aggregateWeekly(collections, 2025);
    const tithes = agg.categories.find((c) => c.key === "general_tithes_offering");
    expect(tithes.weeks[0]).toBe(33185); // 32,685 on 5 Jan + 500 on 2 Jan
    expect(tithes.weeks[1]).toBe(16560);
  });

  test("shares come from the stored share columns", () => {
    const agg = aggregateWeekly(collections, 2025);
    expect(agg.shares.pbcm[0]).toBe(3268.5);
    expect(agg.shares.pastoral[0]).toBe(3268.5);
    expect(agg.shares.operational[0]).toBe(26148);
  });

  test("no collections produces a zeroed structure of the right width", () => {
    const agg = aggregateWeekly([], 2025);
    expect(agg.sundays).toHaveLength(52);
    expect(agg.categories.every((c) => c.weeks.every((w) => w === 0))).toBe(true);
  });
});

describe("weekly grid", () => {
  const collections = [
    col("2025-01-05", { general_tithes_offering: 32685, total_amount: 32685, pbcm_share: 3268.5, pastoral_team_share: 3268.5, operational_fund_share: 26148 }),
  ];
  const SYNCED = "1/1/2026, 9:00:00 AM";

  const grids = () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: collections, expenseRows: [] },
      SYNCED
    );
  };

  test("buildSheetGrids returns six grids, Weekly last", () => {
    expect(grids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
      "2025 Weekly",
    ]);
  });

  test("header carries a column per Sunday plus a Total", () => {
    const g = grids()[5];
    expect(g.values[0][0]).toBe("Category");
    expect(g.values[0][1]).toBe("2025-01-05");
    expect(g.values[0][52]).toBe("2025-12-28");
    expect(g.values[0][53]).toBe("Total");
  });

  test("category rows total across the last week column BA", () => {
    const g = grids()[5];
    expect(g.values[1][0]).toBe("General Tithes & Offering");
    expect(g.values[1][1]).toBe(32685);
    expect(g.values[1][53]).toBe("=SUM(B2:BA2)");
  });

  test("the shares block keeps its week columns aligned with the categories above", () => {
    const g = grids()[5];
    const idx = g.values.findIndex((r) => r[0] === "SHARES");
    expect(g.values[idx + 1][0]).toBe("PDOT Share (10%)");
    expect(g.values[idx + 1][1]).toBe(3268.5);   // column B in both blocks
    expect(g.values[idx + 2][0]).toBe("Pastoral Team (10%)");
    expect(g.values[idx + 3][0]).toBe("Operational Fund (80%)");
  });

  test("a 53-Sunday year widens to column BB", () => {
    const rows = [col("2023-01-01", { general_tithes_offering: 100, total_amount: 100 })];
    const colAgg = aggregateCollections(rows);
    const expAgg = aggregateExpenses([], []);
    const g = buildSheetGrids(
      2023,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: rows, expenseRows: [] },
      SYNCED
    )[5];
    expect(g.values[0][53]).toBe("2023-12-31");
    expect(g.values[0][54]).toBe("Total");
    expect(g.values[1][54]).toBe("=SUM(B2:BB2)");
  });

  test("the tab is stamped and its header frozen", () => {
    const g = grids()[5];
    expect(g.fmt.frozenRowCount).toBe(1);
    expect(g.values[g.values.length - 1][0]).toContain(SYNCED);
  });
});
