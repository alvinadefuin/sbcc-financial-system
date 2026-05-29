import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../utils/api';
import { getAll, updateStatus, remove } from '../../utils/syncQueue';
import { syncPendingEntries } from '../../utils/syncManager';

function formatCurrency(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function StatusBadge({ status }) {
  const cfg = {
    pending: { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: 'rgba(245,158,11,0.22)' },
    failed: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.22)' },
    duplicate: { bg: 'rgba(251,146,60,0.12)', color: '#fb923c', border: 'rgba(251,146,60,0.22)' },
  };
  const c = cfg[status] || { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', border: 'rgba(255,255,255,0.1)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}`, flexShrink: 0 }}>
      {status}
    </span>
  );
}

function TypeIcon({ type }) {
  const isCollection = type === 'collection';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
      background: isCollection ? 'rgba(212,168,67,0.1)' : 'rgba(248,113,113,0.09)',
      border: `1px solid ${isCollection ? 'rgba(212,168,67,0.2)' : 'rgba(248,113,113,0.2)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {isCollection ? (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="6" stroke="#d4a843" strokeWidth="1.2"/>
          <path d="M7.5 4v1.4m0 4.2V11M5.5 6.8h4a.8.8 0 010 1.6H6.5a.8.8 0 000 1.6h4" stroke="#d4a843" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M2.5 7.5h10M9.5 4.5l3 3-3 3" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

function SkeletonCard() {
  return <div className="animate-skeleton" style={{ borderRadius: 14, height: 66, marginBottom: 8 }} />;
}

function SectionHeader({ label }) {
  return (
    <p style={{ margin: '0 0 8px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
      {label}
    </p>
  );
}

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 14,
  padding: 13,
  marginBottom: 8,
};

const CARD_DIVIDER = {
  borderTop: '1px solid rgba(255,255,255,0.06)',
  marginTop: 10,
  paddingTop: 10,
};

function ActionBtn({ accent, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8,
      fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
      border: accent ? '1px solid rgba(245,158,11,0.28)' : '1px solid rgba(255,255,255,0.09)',
      background: accent ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
      color: accent ? '#f59e0b' : 'rgba(255,255,255,0.38)',
    }}>
      {children}
    </button>
  );
}

export default function MobileRecentList({ onQueueChange, onAddSupplement }) {
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
      setEntries(recent);
      setQueued([...queue].sort((a, b) => new Date(b.queuedAt) - new Date(a.queuedAt)));
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
    return (
      <div className="mobile-scroll" style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const isEmpty = queued.length === 0 && entries.length === 0;

  return (
    <div className="mobile-scroll" style={{ height: '100%', overflowY: 'auto', padding: '14px 16px' }}>

      {queued.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <SectionHeader label="Pending" />
          {queued.map(item => {
            const conflict = item.status === 'duplicate' && item.error
              ? (() => { try { return JSON.parse(item.error); } catch { return null; } })()
              : null;
            return (
              <div key={item.localId} style={GLASS_CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <TypeIcon type={item.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e2ec', textTransform: 'capitalize' }}>{item.type}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>{item.data?.date || '—'}</span>
                  </div>
                </div>

                {item.status === 'failed' && (
                  <div style={CARD_DIVIDER}>
                    <p style={{ margin: '0 0 9px', fontSize: 12, color: '#f87171', lineHeight: 1.4 }}>{item.error}</p>
                    <ActionBtn onClick={() => handleRetry(item)}>Retry</ActionBtn>
                  </div>
                )}
                {item.status === 'duplicate' && conflict && (
                  <div style={CARD_DIVIDER}>
                    <p style={{ margin: '0 0 9px', fontSize: 12, color: '#fb923c', lineHeight: 1.4 }}>
                      Already submitted by {conflict.submitted_by} on {conflict.date}.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <ActionBtn accent onClick={() => handleSubmitAnyway(item)}>Submit Anyway</ActionBtn>
                      <ActionBtn onClick={() => handleCancelQueued(item.localId)}>Cancel</ActionBtn>
                    </div>
                  </div>
                )}
                {item.status === 'pending' && (
                  <div style={{ ...CARD_DIVIDER, display: 'flex', justifyContent: 'flex-end' }}>
                    <ActionBtn onClick={() => handleCancelQueued(item.localId)}>Cancel</ActionBtn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <div>
          {queued.length > 0 && <div style={{ margin: '12px 0 8px' }}><SectionHeader label="Synced" /></div>}
          {entries.map(entry => {
            const supplementLabel =
              entry.entryType === 'collection' && entry.payment_method === 'Cash' ? '+ Add GCash' :
              entry.entryType === 'collection' && entry.payment_method === 'GCash' ? '+ Add Cash' :
              null;

            return (
              <div key={`${entry.entryType}-${entry.id}`} style={GLASS_CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <TypeIcon type={entry.entryType} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#e2e2ec', textTransform: 'capitalize' }}>{entry.entryType}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
                          {entry.date} · {entry.created_by}
                        </p>
                      </div>
                      <span className="font-mono-num" style={{ fontSize: 15, fontWeight: 600, flexShrink: 0, color: entry.entryType === 'collection' ? '#d4a843' : '#f87171' }}>
                        {formatCurrency(entry.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>
                {supplementLabel && onAddSupplement && (
                  <div style={{ ...CARD_DIVIDER, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      aria-label={supplementLabel}
                      onClick={() => onAddSupplement(entry)}
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                        border: '1px solid rgba(212,168,67,0.25)',
                        background: 'rgba(212,168,67,0.08)',
                        color: 'rgba(212,168,67,0.75)',
                      }}
                    >
                      {supplementLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isEmpty && (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', gap: 13 }}>
          <div style={{ width: 50, height: 50, borderRadius: 15, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="5" width="16" height="14" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.4"/>
              <path d="M7 2v4M15 2v4M3 9h16" stroke="rgba(255,255,255,0.2)" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No entries yet</p>
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
