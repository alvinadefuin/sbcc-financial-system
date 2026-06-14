import React, { useState, useEffect, useCallback } from 'react';
import { PlusCircle, Clock } from 'lucide-react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import { syncPendingEntries } from '../../utils/syncManager';

export default function MobileLayout({ user, onLogout }) {
  const [tab, setTab] = useState('submit');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [prefill, setPrefill] = useState(null);

  useEffect(() => {
    document.body.style.background = '#fef9f0';
    return () => { document.body.style.background = ''; };
  }, []);

  const handleQueueChange = useCallback((count) => setPendingCount(count), []);

  const handleSubmitted = useCallback((result) => {
    if (result.status === 'success') setTab('recent');
    if (result.status === 'queued') {
      setPendingCount(prev => prev + 1);
      setTimeout(() => setTab('recent'), 800);
    }
  }, []);

  const handleAddSupplement = useCallback((entry) => {
    const otherMethod = entry.payment_method === 'Cash' ? 'GCash' : 'Cash';
    setPrefill({ date: entry.date, payment_method: otherMethod });
    setTab('submit');
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setSyncing(true);
      await syncPendingEntries(handleQueueChange);
      setSyncing(false);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [handleQueueChange]);

  const tabStyle = (active) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '8px 4px',
    borderRadius: 10,
    border: active ? '1px solid #e8c870' : '1px solid transparent',
    cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #fff8e6, #fdefc0)' : 'transparent',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  });

  const tabLabel = (active) => ({
    fontSize: 11,
    fontWeight: 600,
    color: active ? '#c49030' : '#b89048',
  });

  return (
    <div style={{
      height: '100dvh',
      maxWidth: 430,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      background: '#fef9f0',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <ConnectionBanner pendingCount={pendingCount} syncing={syncing} />

      {/* Warm header */}
      <div style={{
        padding: '14px 20px 12px',
        flexShrink: 0,
        background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)',
        borderBottom: '1px solid #e8d090',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/sb-icon.png"
              alt="StewardBox"
              style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3d2a08', lineHeight: 1.2 }}>
                StewardBox
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a6028', lineHeight: 1 }}>
                {user?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              fontSize: 12, color: '#b89048',
              padding: '6px 13px', borderRadius: 8,
              background: 'rgba(196,144,48,0.08)',
              border: '1px solid #e8d090',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar with character icons */}
      <div style={{
        padding: '10px 14px',
        flexShrink: 0,
        background: '#fff8e6',
        borderBottom: '1px solid #f0e4b0',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tabStyle(tab === 'submit')} onClick={() => setTab('submit')}>
            <PlusCircle size={22} style={{ color: tab === 'submit' ? '#c49030' : '#b89048', opacity: tab === 'submit' ? 1 : 0.55 }} />
            <span style={tabLabel(tab === 'submit')}>Submit</span>
          </button>

          <button style={{ ...tabStyle(tab === 'recent'), position: 'relative' }} onClick={() => setTab('recent')}>
            <Clock size={22} style={{ color: tab === 'recent' ? '#c49030' : '#b89048', opacity: tab === 'recent' ? 1 : 0.55 }} />
            <span style={tabLabel(tab === 'recent')}>Recent</span>
            {pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 12,
                width: 16, height: 16, borderRadius: '50%',
                background: '#d4a843', color: '#3d2a08',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'submit'
          ? <MobileSubmitForm
              user={user}
              onSubmitted={handleSubmitted}
              prefill={prefill}
              onPrefillConsumed={() => setPrefill(null)}
            />
          : <MobileRecentList
              onQueueChange={handleQueueChange}
              onAddSupplement={handleAddSupplement}
            />
        }
      </div>
    </div>
  );
}
