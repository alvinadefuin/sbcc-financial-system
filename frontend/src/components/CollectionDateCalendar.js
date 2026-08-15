import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_TITLES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Two palettes rather than two components: the desktop modal is slate/blue,
// the mobile tab is the gold theme used across the phone UI.
const PALETTES = {
  desktop: { accent: '#2563eb', accentText: '#ffffff', available: '#1e293b', availableBg: '#eff6ff', muted: '#cbd5e1', heading: '#0f172a', border: '#e2e8f0' },
  mobile: { accent: '#c49030', accentText: '#fff8e6', available: '#8a6028', availableBg: 'rgba(196,144,48,0.10)', muted: '#d8c9a4', heading: '#3d2a08', border: '#f0e4b0' },
};

export default function CollectionDateCalendar({
  year, month, availableDates, selectedDate, onSelect, onMonthChange, variant = 'desktop',
}) {
  const palette = PALETTES[variant] || PALETTES.desktop;

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
          const isSelected = key === selectedDate;

          return (
            <button
              key={key}
              type="button"
              disabled={!hasRecords}
              aria-pressed={isSelected}
              aria-label={`${MONTH_TITLES[month - 1]} ${day}, ${year}`}
              onClick={() => onSelect(key)}
              style={{
                height: 32, borderRadius: 8, fontSize: 12, padding: 0,
                fontWeight: hasRecords ? 600 : 400,
                fontFamily: 'inherit',
                cursor: hasRecords ? 'pointer' : 'default',
                color: isSelected ? palette.accentText : (hasRecords ? palette.available : palette.muted),
                background: isSelected ? palette.accent : (hasRecords ? palette.availableBg : 'transparent'),
                border: `1px solid ${hasRecords && !isSelected ? palette.border : 'transparent'}`,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
