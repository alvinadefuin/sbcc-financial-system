const { notDeleted } = require('./softDelete');

test('notDeleted returns an unqualified predicate by default', () => {
  expect(notDeleted()).toBe('deleted_at IS NULL');
});

test('notDeleted qualifies the column when given a table alias', () => {
  expect(notDeleted('e')).toBe('e.deleted_at IS NULL');
});

test('notDeleted is re-exported from the database module', () => {
  const db = require('./database');
  expect(db.notDeleted('c')).toBe('c.deleted_at IS NULL');
});
