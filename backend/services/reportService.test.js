const {
  aggregateCollections,
  aggregateExpenses,
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
