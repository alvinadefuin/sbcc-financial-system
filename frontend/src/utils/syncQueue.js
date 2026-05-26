import { openDB } from 'idb';

const DB_NAME = 'sbcc-offline';
const STORE = 'queue';
const VERSION = 1;

function getDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'localId' });
    },
  });
}

export async function enqueue(entry) {
  const db = await getDB();
  const item = {
    ...entry,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: 'pending',
    queuedAt: new Date().toISOString(),
    error: null,
  };
  await db.put(STORE, item);
  return item;
}

export async function getAll() {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function updateStatus(localId, status, error = null) {
  const db = await getDB();
  const item = await db.get(STORE, localId);
  if (!item) return;
  await db.put(STORE, { ...item, status, error });
}

export async function remove(localId) {
  const db = await getDB();
  await db.delete(STORE, localId);
}

export async function getPending() {
  const all = await getAll();
  return all
    .filter(item => item.status === 'pending')
    .sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));
}
