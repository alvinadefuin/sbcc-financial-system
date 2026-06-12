import React, { useState, useEffect } from 'react';

const BASE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '7px 16px',
  flexShrink: 0,
};

export default function ConnectionBanner({ pendingCount, syncing }) {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (!online) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #fff8e0, #fdefc0)', borderBottom: '1px solid #e8c870' }}>
        <img src="/sb-offline.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#8a6028' }}>
          Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} queued
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #e8f8e0, #d0f0c0)', borderBottom: '1px solid #a0d880' }}>
        <img src="/sb-online.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#3a7020' }}>
          Syncing{pendingCount > 0 ? ` ${pendingCount} ${pendingCount === 1 ? 'entry' : 'entries'}` : ''}…
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #fff8e0, #fdefc0)', borderBottom: '1px solid #e8c870' }}>
        <img src="/sb-offline.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#8a6028' }}>
          {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...BASE, background: 'linear-gradient(90deg, #e8f8e0, #d0f0c0)', borderBottom: '1px solid #a0d880' }}>
      <img src="/sb-online.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: '#3a7020' }}>All synced</span>
    </div>
  );
}
