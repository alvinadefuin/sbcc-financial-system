// Mirrors the running-balance coverage in backend/services/reportService.test.js.
// The two report services are duplicate implementations, so the sheet a
// production sync writes must match the one local development writes.
const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
} = require('./reportService');

const col = (date, fields = {}) => ({
  date,
  total_amount: 0,
  general_tithes_offering: 0, bank_interest: 0,
  sisterhood_san_juan: 0, sisterhood_labuin: 0, brotherhood: 0,
  youth: 0, couples: 0, sunday_school: 0, special_purpose_pledge: 0,
  pbcm_share: 0, pastoral_team_share: 0, operational_fund_share: 0,
  ...fields,
});

describe('running balance stops at the current month', () => {
  const SYNCED = '8/16/2026, 5:25:40 PM';

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
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('the year in progress leaves months after the current one blank', () => {
    const months = balanceMonths(gridFor(2026, '2026-08-10'));

    expect(months[7]).toBe(1000);
    expect(months.slice(8)).toEqual(['', '', '', '']);
  });

  test('a finished year still reports all twelve months', () => {
    const months = balanceMonths(gridFor(2025, '2025-01-05'));

    expect(months).toHaveLength(12);
    expect(months.every((m) => m !== '')).toBe(true);
    expect(months[11]).toBe(1000);
  });
});
