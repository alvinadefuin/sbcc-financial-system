import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_TITLES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// One warm palette per surface: the desktop modal sits on white, the mobile tab on
// the cream card. Both are the app's gold — Dashboard.js uses #c49030 and #3d2a08
// throughout and no blue anywhere.
const PALETTES = {
  desktop: {
    accent: '#c49030', accentText: '#fff8e6', available: '#8a6028',
    availableBg: '#fdf6e3', inRangeBg: '#faedd0', muted: '#cbd5e1',
    hint: '#b89048', heading: '#3d2a08', border: '#e8d090',
  },
  mobile: {
    accent: '#c49030', accentText: '#fff8e6', available: '#8a6028',
    availableBg: 'rgba(196,144,48,0.10)', inRangeBg: 'rgba(196,144,48,0.20)',
    muted: '#d8c9a4', hint: '#b89048', heading: '#3d2a08', border: '#f0e4b0',
  },
};

export default function CollectionDateCalendar({
  year, month, availableDates, selection, onSelect, onMonthChange, variant = 'desktop',
}) {
  const palette = PALETTES[variant] || PALETTES.desktop;
  const start = selection?.start || null;
  const end = selection?.end || null;
  const isRange = Boolean(end && end !== start);

  // Built from numbers, never from an ISO string — see toDateKey in sundaySummary.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const keyFor = (day) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const step = (delta) => {
    const next = new Date(year, month - 1 + delta, 1);
    onMonthChange(next.getFullYear(), next.getMonth() + 1);
  };

  const arrowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 8,
    background: 'transparent', border: `1px solid ${palette.border}`,
    color: palette.heading, cursor: 'pointer', padding: 0,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" aria-label="Previous month" onClick={() => step(-1)} style={arrowStyle}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: palette.heading }}>
          {MONTH_TITLES[month - 1].toUpperCase()} {year}
        </span>
        <button type="button" aria-label="Next month" onClick={() => step(1)} style={arrowStyle}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DAY_LABELS.map((label) => (
          <span key={label} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: palette.muted, paddingBottom: 4 }}>
            {label}
          </span>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />;

          const key = keyFor(day);
          const hasRecords = availableDates.has(key);
          const isStart = key === start;
          const isEnd = key === end;
          const isEndpoint = isStart || isEnd;
          // Strictly between the two ends: tinted as part of the band, but still
          // only clickable if it has records of its own.
          const inRange = Boolean(start && end && key > start && key < end);

          const label = `${MONTH_TITLES[month - 1]} ${day}, ${year}`;
          const rangeLabel = isRange && isStart ? `${label}, range start`
            : isRange && isEnd ? `${label}, range end`
            : label;

          const background = isEndpoint ? palette.accent
            : inRange ? palette.inRangeBg
            : hasRecords ? palette.availableBg
            : 'transparent';

          const color = isEndpoint ? palette.accentText
            : (inRange || hasRecords) ? palette.available
            : palette.muted;

          return (
            <button
              key={key}
              type="button"
              disabled={!hasRecords}
              aria-pressed={isEndpoint || inRange}
              aria-label={rangeLabel}
              onClick={() => onSelect(key)}
              style={{
                height: 32, borderRadius: 8, fontSize: 12, padding: 0,
                fontWeight: hasRecords ? 600 : 400,
                fontFamily: 'inherit',
                cursor: hasRecords ? 'pointer' : 'default',
                color,
                background,
                border: `1px solid ${hasRecords && !isEndpoint ? palette.border : 'transparent'}`,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: palette.hint, textAlign: 'center' }}>
        Pick a date, or pick two for a range.
      </p>
    </div>
  );
}
