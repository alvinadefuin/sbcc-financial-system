const {
  aggregateCollections,
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
