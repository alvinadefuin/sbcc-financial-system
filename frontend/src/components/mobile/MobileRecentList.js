import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../utils/api';
import { getAll, updateStatus, remove } from '../../utils/syncQueue';
import { syncPendingEntries } from '../../utils/syncManager';

function formatCurrency(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    duplicate: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${styles[status] || ''}`}>
      {status}
    </span>
  );
}

export default function MobileRecentList({ onQueueChange }) {
  const [entries, setEntries] = useState([]);
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, queue] = await Promise.all([
        apiService.getRecentEntries(20).catch(() => []),
        getAll(),
      ]);
      const sortedQueue = [...queue].sort((a, b) => new Date(b.queuedAt) - new Date(a.queuedAt));
      setEntries(recent);
      setQueued(sortedQueue);
      onQueueChange?.(queue.filter(q => q.status === 'pending').length);
    } finally {
      setLoading(false);
    }
  }, [onQueueChange]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (item) => {
    await updateStatus(item.localId, 'pending', null);
    await syncPendingEntries(load);
    load();
  };

  const handleSubmitAnyway = async (item) => {
    await updateStatus(item.localId, 'pending', null);
    const { getAll: getAllQueue } = await import('../../utils/syncQueue');
    const all = await getAllQueue();
    const target = all.find(q => q.localId === item.localId);
    if (target) {
      const { openDB } = await import('idb');
      const db = await openDB('sbcc-offline', 1);
      await db.put('queue', { ...target, force: true });
    }
    await syncPendingEntries(load);
    load();
  };

  const handleCancelQueued = async (localId) => {
    await remove(localId);
    load();
  };

  if (loading) {
    return <div className="p-4 text-slate-500 text-sm text-center">Loading...</div>;
  }

  return (
    <div className="divide-y divide-slate-800">
      {/* Queued entries first */}
      {queued.map(item => {
        const conflict = item.status === 'duplicate' && item.error
          ? (() => { try { return JSON.parse(item.error); } catch { return null; } })()
          : null;
        return (
          <div key={item.localId} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white capitalize">{item.type}</p>
                <p className="text-xs text-slate-500">{item.data?.date || '—'}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {item.status === 'failed' && (
              <div className="space-y-2">
                <p className="text-xs text-red-400">{item.error}</p>
                <button
                  onClick={() => handleRetry(item)}
                  className="text-xs px-3 py-1 rounded bg-slate-700 text-white"
                >
                  Retry
                </button>
              </div>
            )}
            {item.status === 'duplicate' && conflict && (
              <div className="space-y-2">
                <p className="text-xs text-orange-300">
                  Already submitted by {conflict.submitted_by} on {conflict.date}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSubmitAnyway(item)}
                    className="text-xs px-3 py-1 rounded bg-amber-600 text-white"
                  >
                    Submit Anyway
                  </button>
                  <button
                    onClick={() => handleCancelQueued(item.localId)}
                    className="text-xs px-3 py-1 rounded bg-slate-700 text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Synced entries from API */}
      {entries.map(entry => (
        <div key={`${entry.entryType}-${entry.id}`} className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white capitalize">{entry.entryType}</p>
            <p className="text-xs text-slate-500">
              {entry.date} · {entry.created_by}
            </p>
          </div>
          <p className="text-sm font-semibold text-indigo-400">{formatCurrency(entry.total_amount)}</p>
        </div>
      ))}

      {queued.length === 0 && entries.length === 0 && (
        <p className="p-8 text-slate-500 text-sm text-center">No entries yet.</p>
      )}
    </div>
  );
}
