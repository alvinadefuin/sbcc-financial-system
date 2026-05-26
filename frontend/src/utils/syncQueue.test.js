import 'fake-indexeddb/auto';
import { enqueue, getAll, getPending, updateStatus, remove } from './syncQueue';

beforeEach(async () => {
  // Clear the database between tests by re-opening with a higher version
  // Simpler: just remove all items
  const all = await getAll();
  for (const item of all) {
    await remove(item.localId);
  }
});

test('enqueue adds item with pending status and localId', async () => {
  const item = await enqueue({ type: 'collection', data: { date: '2026-05-26', total_amount: 100 } });
  expect(item.localId).toBeDefined();
  expect(item.status).toBe('pending');
  expect(item.queuedAt).toBeDefined();
});

test('getAll returns all queued items', async () => {
  await enqueue({ type: 'collection', data: { date: '2026-05-26' } });
  await enqueue({ type: 'expense', data: { date: '2026-05-26' } });
  const all = await getAll();
  expect(all.length).toBe(2);
});

test('getPending returns only pending items', async () => {
  const a = await enqueue({ type: 'collection', data: {} });
  await enqueue({ type: 'expense', data: {} });
  await updateStatus(a.localId, 'synced');
  const pending = await getPending();
  expect(pending.length).toBe(1);
  expect(pending[0].status).toBe('pending');
});

test('updateStatus changes item status', async () => {
  const item = await enqueue({ type: 'collection', data: {} });
  await updateStatus(item.localId, 'failed', 'Network error');
  const all = await getAll();
  const updated = all.find(i => i.localId === item.localId);
  expect(updated.status).toBe('failed');
  expect(updated.error).toBe('Network error');
});

test('remove deletes item from queue', async () => {
  const item = await enqueue({ type: 'collection', data: {} });
  await remove(item.localId);
  const all = await getAll();
  expect(all.find(i => i.localId === item.localId)).toBeUndefined();
});

test('getPending returns items in chronological order', async () => {
  // enqueue sequentially so timestamps differ
  const a = await enqueue({ type: 'collection', data: {} });
  await new Promise(r => setTimeout(r, 5));
  const b = await enqueue({ type: 'expense', data: {} });
  const pending = await getPending();
  expect(pending[0].localId).toBe(a.localId);
  expect(pending[1].localId).toBe(b.localId);
});
