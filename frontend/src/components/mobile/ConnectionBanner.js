import React, { useState, useEffect } from 'react';

function BannerDot({ color, pulse = true }) {
  return (
    <span
      className={pulse ? 'animate-pulse-dot' : ''}
      style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );
}

const BANNER = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '7px 16px',
  flexShrink: 0,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
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
      <div style={{ ...BANNER, background: 'rgba(180,100,0,0.25)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
        <BannerDot color="#f59e0b" />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#f59e0b' }}>
          Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} queued
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div style={{ ...BANNER, background: 'rgba(60,60,200,0.2)', borderBottom: '1px solid rgba(100,100,245,0.2)' }}>
        <BannerDot color="#818cf8" />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#a5b4fc' }}>
          Syncing{pendingCount > 0 ? ` ${pendingCount} ${pendingCount === 1 ? 'entry' : 'entries'}` : ''}…
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div style={{ ...BANNER, background: 'rgba(160,90,0,0.18)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
        <BannerDot color="#f59e0b" />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fbbf24' }}>
          {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...BANNER, background: 'rgba(0,140,80,0.15)', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
      <BannerDot color="#10b981" pulse={false} />
      <span style={{ fontSize: 12, fontWeight: 500, color: '#34d399' }}>All synced</span>
    </div>
  );
}
