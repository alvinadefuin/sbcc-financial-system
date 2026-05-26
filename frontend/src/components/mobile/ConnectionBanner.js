import React, { useState, useEffect } from 'react';

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
      <div className="bg-amber-500 text-white text-xs font-medium text-center py-1.5 px-4">
        Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
      </div>
    );
  }
  if (syncing || pendingCount > 0) {
    return (
      <div className="bg-blue-500 text-white text-xs font-medium text-center py-1.5 px-4">
        Syncing...
      </div>
    );
  }
  return (
    <div className="bg-emerald-500 text-white text-xs font-medium text-center py-1.5 px-4">
      Synced
    </div>
  );
}
