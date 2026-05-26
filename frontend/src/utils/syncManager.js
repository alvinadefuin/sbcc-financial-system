import axios from 'axios';
import { getPending, updateStatus, remove } from './syncQueue';

const API_BASE = process.env.REACT_APP_API_URL || '';

async function submitEntry(entry) {
  const url = entry.type === 'collection'
    ? `${API_BASE}/api/collections`
    : `${API_BASE}/api/expenses`;
  const token = localStorage.getItem('authToken');
  return axios.post(url, { ...entry.data, force: entry.force || false }, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function syncPendingEntries(onUpdate) {
  const pending = await getPending();
  for (const entry of pending) {
    try {
      await submitEntry(entry);
      await remove(entry.localId);
    } catch (err) {
      if (err.response?.status === 409) {
        await updateStatus(entry.localId, 'duplicate', JSON.stringify(err.response.data.conflict));
      } else {
        await updateStatus(entry.localId, 'failed', err.message);
      }
    }
    onUpdate?.();
  }
}

export function startSyncListener(onUpdate) {
  const handle = () => syncPendingEntries(onUpdate);
  window.addEventListener('online', handle);
  return () => window.removeEventListener('online', handle);
}
