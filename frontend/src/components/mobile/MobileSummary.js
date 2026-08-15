import React, { useState, useRef } from 'react';
import { ClipboardCopy, Check, AlertTriangle } from 'lucide-react';
import useSundaySummary from '../../hooks/useSundaySummary';
import { formatPeso } from '../../utils/sundaySummary';
import CollectionDateCalendar from '../CollectionDateCalendar';

const CARD = {
  background: '#fff8e6',
  border: '1px solid #f0e4b0',
  borderRadius: 14,
  padding: 14,
};

export default function MobileSummary() {
  const {
    year, month, changeMonth, availableDates, selection, selectDate,
    summary, text, setText, loading, error, copy,
  } = useSundaySummary(true);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef(null);

  const handleCopy = async () => {
    const ok = await copy();
    setCopied(ok);
    setCopyFailed(!ok);
    // Both clipboard paths refused — select the text so the user can copy by hand.
    if (ok) setTimeout(() => setCopied(false), 2000);
    else textRef.current?.select();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={CARD}>
          <CollectionDateCalendar
            year={year}
            month={month}
            availableDates={availableDates}
            selection={selection}
            onSelect={selectDate}
            onMonthChange={changeMonth}
            variant="mobile"
          />
        </div>

        {loading && <p style={{ margin: 0, fontSize: 13, color: '#b89048', textAlign: 'center' }}>Loading collections…</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: '#b4471f' }}>{error}</p>}

        {!loading && !error && !selection && (
          <p style={{ margin: 0, fontSize: 13, color: '#b89048', textAlign: 'center' }}>
            No collections recorded in this month
          </p>
        )}

        {selection && (
          <>
            {summary?.unattributed > 0 && (
              <p style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, color: '#8a6028', lineHeight: 1.5 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Some records for this date have no category breakdown
                  (Php {formatPeso(summary.unattributed)}) — check the records.
                </span>
              </p>
            )}

            <textarea
              ref={textRef}
              className="mobile-input"
              aria-label="Collection message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={16}
              style={{ resize: 'none', lineHeight: 1.6, fontSize: 13 }}
            />
            <p style={{ margin: 0, fontSize: 11, color: '#b89048' }}>
              {copyFailed
                ? 'Press and hold to copy.'
                : 'Edit before copying — add the attendance line here.'}
            </p>
          </>
        )}
      </div>

      <div
        className="mobile-footer-safe"
        style={{ flexShrink: 0, background: '#fef3d0', borderTop: '1.5px solid #e8d090', padding: '14px 16px' }}
      >
        <button
          onClick={handleCopy}
          disabled={!selection}
          style={{
            width: '100%', height: 48, borderRadius: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: selection ? '#c49030' : '#e8d090',
            border: 'none', color: '#fff8e6',
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            cursor: selection ? 'pointer' : 'default',
          }}
        >
          {copied ? <Check size={18} /> : <ClipboardCopy size={18} />}
          {copied ? 'Copied!' : 'Copy message'}
        </button>
      </div>
    </div>
  );
}
