const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
  sundaysIn,
  weekIndexFor,
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

  test("returns 5 grids with year-prefixed titles in order", () => {
    expect(makeGrids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
    ]);
  });

  test("collections grid: header, SUM formulas, totals row, sync stamp", () => {
    const grid = makeGrids()[1];
    expect(grid.values[0]).toEqual(["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    // 9 category rows at sheet rows 2-10
    expect(grid.values[1][0]).toBe("General Tithes & Offering");
    expect(grid.values[1][1]).toBe(1000);
    expect(grid.values[1][13]).toBe("=SUM(B2:M2)");
    // totals row at sheet row 11
    expect(grid.values[10][0]).toBe("Total");
    expect(grid.values[10][1]).toBe("=SUM(B2:B10)");
    expect(grid.values[10][13]).toBe("=SUM(N2:N10)");
    // stamp
    expect(grid.values[grid.values.length - 1][0]).toContain(SYNCED);
    expect(grid.fmt.frozenRowCount).toBe(1);
    expect(grid.fmt.boldRows).toEqual([0, 10]);
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
    expect(grid.values[10]).toEqual(["Fund", "Share", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[11][0]).toBe("PBCM/PDOT Share");
    expect(grid.values[11][14]).toBe("=SUM(C12:N12)");
    expect(grid.values[16]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[17][3]).toBe("=B18-C18");
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

    expect(stamps).toHaveLength(5);
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
