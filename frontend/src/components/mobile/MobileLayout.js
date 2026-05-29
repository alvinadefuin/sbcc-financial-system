import React, { useState, useEffect, useCallback } from 'react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import { syncPendingEntries } from '../../utils/syncManager';

function CrossIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="6" y="0.5" width="3" height="14" rx="1.5" fill="#d4a843" />
      <rect x="0.5" y="6" width="14" height="3" rx="1.5" fill="#d4a843" />
    </svg>
  );
}

export default function MobileLayout({ user, onLogout }) {
  const [tab, setTab] = useState('submit');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [prefill, setPrefill] = useState(null);

  // Paint the page background to match so no flash outside the 430px column
  useEffect(() => {
    document.body.style.background = '#08081a';
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

  const pillTab = (active) => ({
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
    borderRadius: 9,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: active ? 'rgba(212,168,67,0.18)' : 'transparent',
    color: active ? '#d4a843' : 'rgba(255,255,255,0.32)',
    position: 'relative',
  });

  return (
    <div style={{
      height: '100dvh',
      maxWidth: 430,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      background: '#08081a',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Gradient blobs — give the glass surfaces something to blur */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-25%',
          width: '80%', height: '65%',
          background: 'radial-gradient(ellipse, rgba(88,60,210,0.32) 0%, transparent 65%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-20%',
          width: '70%', height: '55%',
          background: 'radial-gradient(ellipse, rgba(180,115,20,0.22) 0%, transparent 65%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', top: '35%', right: '-5%',
          width: '55%', height: '40%',
          background: 'radial-gradient(ellipse, rgba(30,80,200,0.14) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }} />
      </div>

      {/* All UI above the blobs */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <ConnectionBanner pendingCount={pendingCount} syncing={syncing} />

        {/* Glass header */}
        <div style={{
          padding: '14px 20px 12px',
          flexShrink: 0,
          background: 'rgba(8,8,26,0.72)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11,
                background: 'rgba(212,168,67,0.12)',
                border: '1px solid rgba(212,168,67,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CrossIcon />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#eeeef8', lineHeight: 1.2 }}>
                  SBCC Finance
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.32)', lineHeight: 1 }}>
                  {user?.name}
                </p>
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                fontSize: 12, color: 'rgba(255,255,255,0.42)',
                padding: '6px 13px', borderRadius: 8,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: 'inherit', cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Glass tab bar */}
        <div style={{
          padding: '10px 16px',
          flexShrink: 0,
          background: 'rgba(8,8,26,0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            display: 'flex', gap: 3, padding: 4,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <button style={pillTab(tab === 'submit')} onClick={() => setTab('submit')}>
              Submit
            </button>
            <button style={pillTab(tab === 'recent')} onClick={() => setTab('recent')}>
              Recent
              {pendingCount > 0 && (
                <span style={{
                  position: 'absolute', top: 3, right: 14,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#d4a843', color: '#08080d',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content — each child manages its own scroll */}
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
    </div>
  );
}
