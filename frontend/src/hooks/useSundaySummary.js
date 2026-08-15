import { useState, useEffect, useCallback } from 'react';
import apiService from '../utils/api';
import {
  buildSummary, collectionDatesInMonth, formatSummaryText, nextSelection,
} from '../utils/sundaySummary';

/** Clipboard fallback for browsers without the async clipboard API. */
function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    return false;
  }
}

/**
 * Owns everything the two summary shells share: the month fetch, the set of
 * selectable dates, the generated message, and clipboard access.
 *
 * @param {boolean} isActive - false while the modal is closed or the tab is
 *   hidden, so nothing is fetched until it is on screen.
 */
export default function useSundaySummary(isActive) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [records, setRecords] = useState([]);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [availableDates, setAvailableDates] = useState(() => new Set());
  const [selection, setSelection] = useState(null);
  const [summary, setSummary] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isActive) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [defs, rows] = await Promise.all([
          apiService.getCustomFields('collections'),
          apiService.getCollections({
            month: String(month).padStart(2, '0'),
            year: String(year),
          }),
        ]);
        if (cancelled) return;
        setFieldDefs(defs || []);
        setRecords(rows || []);
        const dates = collectionDatesInMonth(rows);
        setAvailableDates(dates);
        // Latest date in the month — normally the Sunday just recorded. Setting it
        // here is also what discards a half-made range when the month changes.
        const latest = [...dates].sort().pop() || null;
        setSelection(latest ? { start: latest, end: null } : null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load collections');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isActive, year, month]);

  useEffect(() => {
    if (!selection) {
      setSummary(null);
      setText('');
      return;
    }
    const next = buildSummary(records, fieldDefs, selection.start, selection.end);
    setSummary(next);
    setText(formatSummaryText(next));
  }, [selection, records, fieldDefs]);

  const selectDate = useCallback((key) => {
    setSelection((prev) => nextSelection(prev, key));
  }, []);

  const changeMonth = useCallback((nextYear, nextMonth) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);

  const copy = useCallback(async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Permission denied or insecure context — fall through.
      }
    }
    return legacyCopy(text);
  }, [text]);

  return {
    year, month, changeMonth,
    availableDates, selection, selectDate,
    summary, text, setText,
    loading, error, copy,
  };
}
