import React, { useState, useRef } from 'react';
import { X, ClipboardCopy, Check, AlertTriangle } from 'lucide-react';
import useSundaySummary from '../hooks/useSundaySummary';
import { formatPeso } from '../utils/sundaySummary';
import CollectionDateCalendar from './CollectionDateCalendar';

const SundayCollectionModal = ({ isOpen, onClose }) => {
  const {
    year, month, changeMonth, availableDates, selection, selectDate,
    summary, text, setText, loading, error, copy,
  } = useSundaySummary(isOpen);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef(null);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const ok = await copy();
    setCopied(ok);
    setCopyFailed(!ok);
    // Both clipboard paths refused — select the text so the user can copy by hand.
    if (ok) setTimeout(() => setCopied(false), 2000);
    else textRef.current?.select();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Sunday Collection</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <CollectionDateCalendar
            year={year}
            month={month}
            availableDates={availableDates}
            selection={selection}
            onSelect={selectDate}
            onMonthChange={changeMonth}
            variant="desktop"
          />

          {loading && <p className="text-xs text-slate-400">Loading collections…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {!loading && !error && !selection && (
            <div className="flex items-center justify-center h-24 text-slate-400 border border-dashed border-slate-200 rounded-lg">
              <p className="text-xs">No collections recorded in this month</p>
            </div>
          )}

          {selection && (
            <>
              {summary?.unattributed > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Some records for this date have no category breakdown
                    (Php {formatPeso(summary.unattributed)}) — check the records.
                  </span>
                </p>
              )}

              <textarea
                ref={textRef}
                aria-label="Collection message"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={16}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-xs text-slate-400">
                {copyFailed
                  ? 'Press and hold to copy.'
                  : 'Edit anything you like before copying — add the attendance line here.'}
              </p>
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition">
            Close
          </button>
          <button
            onClick={handleCopy}
            disabled={!selection}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SundayCollectionModal;
