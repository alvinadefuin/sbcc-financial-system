import React, { useState, useEffect, useCallback } from 'react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import { syncPendingEntries } from '../../utils/syncManager';

export default function MobileLayout({ user, onLogout }) {
  const [tab, setTab] = useState('submit');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const handleQueueChange = useCallback((count) => {
    setPendingCount(count);
  }, []);

  const handleSubmitted = useCallback((result) => {
    if (result.status === 'success') {
      setTab('recent');
    }
    if (result.status === 'queued') {
      setTimeout(() => setTab('recent'), 800);
    }
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-md mx-auto">
      <ConnectionBanner pendingCount={pendingCount} syncing={syncing} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="text-sm font-semibold text-white">SBCC Finance</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setTab('submit')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'submit' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'
          }`}
        >
          Submit
        </button>
        <button
          onClick={() => setTab('recent')}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            tab === 'recent' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'
          }`}
        >
          Recent
          {pendingCount > 0 && (
            <span className="absolute top-2 right-8 w-4 h-4 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'submit' ? (
          <MobileSubmitForm user={user} onSubmitted={handleSubmitted} />
        ) : (
          <MobileRecentList onQueueChange={handleQueueChange} />
        )}
      </div>
    </div>
  );
}
