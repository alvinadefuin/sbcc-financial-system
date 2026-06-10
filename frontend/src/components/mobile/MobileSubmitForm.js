import React, { useState, useMemo, useEffect, useRef } from 'react';
import apiService from '../../utils/api';
import DenominationCalculator from './DenominationCalculator';

const EXPENSE_CATEGORIES = [
  'workers_share', 'supplies', 'utilities', 'building_maintenance',
  'vehicle_maintenance', 'transportation_gas', 'honorarium',
  'fellowship_events', 'abccop_national', 'cbcc_share', 'kabalikat_share',
];

const GLASS_CARD = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 18,
  overflow: 'hidden',
};

function CardSection({ label, children }) {
  return (
    <div>
      <p style={{
        margin: '0 0 8px 4px',
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.3)',
      }}>
        {label}
      </p>
      <div style={GLASS_CARD}>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: 11, fontWeight: 500,
        color: 'rgba(255,255,255,0.35)', marginBottom: 5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}{required && <span style={{ color: '#d4a843', marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

function formatTotal(val) {
  if (!val) return '₱0';
  return `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const buildInitialForm = (fields, isCollection) => {
  const base = isCollection
    ? { date: '', particular: '', control_number: '', payment_method: 'Cash' }
    : { date: '', particular: '', category: '', cheque_number: '', forms_number: '' };
  fields.forEach(f => { base[f.field_name] = ''; });
  return base;
};

function CalcIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.6" y="0.6" width="11.8" height="11.8" rx="2.4" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="2.5" y="2.5" width="3" height="2" rx="0.6" fill="currentColor"/>
      <rect x="7.5" y="2.5" width="3" height="2" rx="0.6" fill="currentColor"/>
      <rect x="2.5" y="6" width="3" height="2" rx="0.6" fill="currentColor"/>
      <rect x="7.5" y="6" width="3" height="2" rx="0.6" fill="currentColor"/>
      <rect x="2.5" y="9.5" width="3" height="1" rx="0.5" fill="currentColor"/>
      <rect x="7.5" y="9.5" width="3" height="1" rx="0.5" fill="currentColor"/>
    </svg>
  );
}

function BreakdownField({ field, value, onChange, onOpenCalc }) {
  const hasValue = value !== '' && value !== undefined && value !== null && Number(value) > 0;
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, fontWeight: 500,
        color: 'rgba(255,255,255,0.35)', marginBottom: 5,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {field.field_label}
        </span>
        <button
          type="button"
          onClick={onOpenCalc}
          title="Open denomination calculator"
          style={{
            marginLeft: 5, flexShrink: 0,
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(212,168,67,0.12)',
            border: '1px solid rgba(212,168,67,0.25)',
            color: 'rgba(212,168,67,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
            transition: 'all 0.15s',
          }}
        >
          <CalcIcon />
        </button>
      </span>
      <input
        className="mobile-input mono"
        name={field.field_name}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        placeholder="0.00"
        style={hasValue ? { borderColor: 'rgba(212,168,67,0.3)', color: '#d4a843' } : {}}
      />
    </label>
  );
}

export default function MobileSubmitForm({ user, onSubmitted, prefill = null, onPrefillConsumed }) {
  const [type, setType] = useState('collection');
  const [form, setForm] = useState({ date: '', particular: '', control_number: '', payment_method: 'Cash' });
  const prefillRef = useRef(null); // pending prefill waiting to be applied
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(false);

  const [collectionFields, setCollectionFields] = useState([]);
  const [expenseFields, setExpenseFields] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [calcField, setCalcField] = useState(null); // field_name of open calculator
  const [prefillBanner, setPrefillBanner] = useState(null);

  useEffect(() => {
    if (prefill) {
      prefillRef.current = prefill;
    }
  }, [prefill]);

  useEffect(() => {
    const loadFields = async (silent = false) => {
      try {
        if (!silent) setFieldsLoading(true);
        const [colFields, expFields] = await Promise.all([
          apiService.getCustomFields('collections'),
          apiService.getCustomFields('expenses'),
        ]);
        const filteredCol = colFields.filter(f => f.field_type === 'decimal');
        const filteredExp = expFields.filter(f => f.field_type === 'decimal');

        setCollectionFields(filteredCol);
        setExpenseFields(filteredExp);

        if (silent) {
          // Patch form: add keys for any newly-added fields, preserve existing values
          setForm(prev => {
            const patch = {};
            filteredCol.forEach(f => { if (!(f.field_name in prev)) patch[f.field_name] = ''; });
            filteredExp.forEach(f => { if (!(f.field_name in prev)) patch[f.field_name] = ''; });
            return Object.keys(patch).length ? { ...prev, ...patch } : prev;
          });
        } else {
          const mp = prefillRef.current;
          const base = buildInitialForm(filteredCol, true);
          if (mp) {
            const date = mp.date || '';
            const paymentMethod = mp.payment_method || 'Cash';
            setForm({ ...base, date, payment_method: paymentMethod });
            setPrefillBanner(`Adding ${paymentMethod} for ${date}`);
            onPrefillConsumed?.();
            prefillRef.current = null;
          } else {
            setForm(base);
          }
        }
      } catch (err) {
        console.error('Failed to load custom fields', err);
        if (!silent) setError('Could not load amount fields — please refresh.');
      } finally {
        if (!silent) setFieldsLoading(false);
      }
    };

    loadFields();

    // Re-fetch when the tab becomes visible (admin may have changed fields)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadFields(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Poll every 30 s so changes appear without needing a tab switch
    const interval = setInterval(() => loadFields(true), 30_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handles mid-session prefill updates (form already mounted, fields already loaded)
  useEffect(() => {
    if (!prefill || fieldsLoading) return;
    const mp = prefillRef.current;
    if (!mp) return; // already applied by loadFields
    const date = mp.date || '';
    const paymentMethod = mp.payment_method || 'Cash';
    setForm(prev => ({ ...prev, date, payment_method: paymentMethod }));
    setPrefillBanner(`Adding ${paymentMethod} for ${date}`);
    onPrefillConsumed?.();
    prefillRef.current = null;
  }, [prefill, fieldsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCollection = type === 'collection';

  const total = useMemo(() => {
    const fields = isCollection ? collectionFields : expenseFields;
    return fields.reduce((sum, f) => sum + (parseFloat(form[f.field_name]) || 0), 0);
  }, [form, isCollection, collectionFields, expenseFields]);

  const handleTypeToggle = (t) => {
    setType(t);
    setForm(buildInitialForm(t === 'collection' ? collectionFields : expenseFields, t === 'collection'));
    setConflict(null);
    setError(null);
    setQueued(false);
    setPrefillBanner(null);
  };

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const doSubmit = async (force = false) => {
    setSubmitting(true);
    setError(null);
    setConflict(null);
    setQueued(false);
    try {
      const payload = force ? { ...form, force: true } : { ...form };
      const result = await apiService.submitForMobile(type, payload);
      if (result.status === 'success' || result.status === 'queued') {
        if (result.status === 'queued') setQueued(true);
        setForm(buildInitialForm(isCollection ? collectionFields : expenseFields, isCollection));
        setPrefillBanner(null);
        onSubmitted(result);
      } else if (result.status === 'duplicate') {
        setConflict(result.conflict);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); doSubmit(false); }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* ── Scrollable fields ───────────────────────────────── */}
      <div
        className="mobile-scroll"
        style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {/* Prefill info banner */}
        {prefillBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderRadius: 11,
            background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.18)',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(212,168,67,0.85)', lineHeight: 1.4 }}>
              {prefillBanner} — change if needed
            </span>
            <button
              type="button"
              aria-label="dismiss"
              onClick={() => setPrefillBanner(null)}
              style={{
                marginLeft: 10, flexShrink: 0,
                width: 20, height: 20, borderRadius: 5,
                background: 'transparent', border: 'none',
                color: 'rgba(212,168,67,0.5)', fontSize: 14,
                fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Type toggle */}
        <div style={{
          display: 'flex', gap: 3, padding: 4,
          borderRadius: 13,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          {[
            ['collection', 'Collection', '#d4a843', 'rgba(212,168,67,0.18)'],
            ['expense', 'Expense', '#f87171', 'rgba(248,113,113,0.14)'],
          ].map(([val, label, color, bg]) => (
            <button
              key={val}
              type="button"
              onClick={() => handleTypeToggle(val)}
              style={{
                flex: 1, padding: '9px 0',
                fontSize: 13, fontWeight: 500,
                fontFamily: 'inherit', borderRadius: 10,
                border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
                background: type === val ? bg : 'transparent',
                color: type === val ? color : 'rgba(255,255,255,0.3)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Details section */}
        <CardSection label="Details">
          <Field label="Date" required>
            <input className="mobile-input" name="date" type="date" required value={form.date} onChange={handleChange} />
          </Field>

          {isCollection ? (
            <>
              <Field label="Particular / Notes">
                <textarea
                  className="mobile-input"
                  name="particular"
                  rows={2}
                  value={form.particular}
                  onChange={handleChange}
                  placeholder="Optional"
                  style={{ resize: 'none', lineHeight: 1.5 }}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Control No.">
                  <input className="mobile-input" name="control_number" type="text" value={form.control_number} onChange={handleChange} placeholder="—" />
                </Field>
                <Field label="Payment">
                  <select className="mobile-input" name="payment_method" value={form.payment_method} onChange={handleChange}>
                    <option>Cash</option>
                    <option>Check</option>
                    <option>Bank Transfer</option>
                    <option>GCash</option>
                  </select>
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Category" required>
                <select className="mobile-input" name="category" required value={form.category} onChange={handleChange}>
                  <option value="">Select category…</option>
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Particular / Notes">
                <textarea
                  className="mobile-input"
                  name="particular"
                  rows={2}
                  value={form.particular}
                  onChange={handleChange}
                  placeholder="Optional"
                  style={{ resize: 'none', lineHeight: 1.5 }}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Cheque No.">
                  <input className="mobile-input" name="cheque_number" type="text" value={form.cheque_number} onChange={handleChange} placeholder="—" />
                </Field>
                <Field label="Forms No.">
                  <input className="mobile-input" name="forms_number" type="text" value={form.forms_number} onChange={handleChange} placeholder="—" />
                </Field>
              </div>
            </>
          )}
        </CardSection>

        {/* Breakdown section */}
        <CardSection label={isCollection ? 'Financial Breakdown' : 'Expense Breakdown'}>
          {fieldsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              Loading fields…
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(isCollection ? collectionFields : expenseFields).map(field => (
                <BreakdownField
                  key={field.field_name}
                  field={field}
                  value={form[field.field_name] ?? ''}
                  onChange={handleChange}
                  onOpenCalc={() => setCalcField(field.field_name)}
                />
              ))}
            </div>
          )}
        </CardSection>

        {/* Denomination calculator */}
        {calcField && (() => {
          const fields = isCollection ? collectionFields : expenseFields;
          const activeField = fields.find(f => f.field_name === calcField);
          return (
            <DenominationCalculator
              isOpen
              fieldLabel={activeField?.field_label ?? calcField}
              currentValue={form[calcField]}
              onConfirm={val => {
                setForm(prev => ({ ...prev, [calcField]: val }));
                setCalcField(null);
              }}
              onClose={() => setCalcField(null)}
            />
          );
        })()}

        {/* Bottom breathing room so last field clears the sticky footer */}
        <div style={{ height: 8 }} />
      </div>

      {/* ── Sticky glass footer ─────────────────────────────── */}
      <div
        className="mobile-footer-safe"
        style={{
          flexShrink: 0,
          background: 'rgba(5,5,20,0.9)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '14px 16px',
        }}
      >
        {/* Conflict dialog */}
        {conflict && (
          <div style={{ borderRadius: 13, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', padding: '13px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#fbbf24', lineHeight: 1.5 }}>
              A similar entry was already submitted by <strong>{conflict.submitted_by}</strong> on {conflict.date}.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setConflict(null); doSubmit(true); }}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.28)', color: '#f59e0b', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                Submit Anyway
              </button>
              <button type="button" onClick={() => setConflict(null)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status messages */}
        {queued && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 13px', borderRadius: 10, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.18)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#f59e0b" strokeWidth="1.2"/><path d="M7 4v3.3l2 1.4" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 12, color: '#f59e0b' }}>Saved offline — will sync when connected.</span>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 12, padding: '10px 13px', borderRadius: 10, background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>
          </div>
        )}

        {/* Total + submit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.38)' }}>Total</span>
          <span className="font-mono-num" style={{ fontSize: 22, fontWeight: 600, color: total > 0 ? '#d4a843' : 'rgba(255,255,255,0.18)', transition: 'color 0.2s' }}>
            {formatTotal(total)}
          </span>
        </div>

        <button type="submit" disabled={submitting || fieldsLoading} className="mobile-submit-btn">
          {submitting ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg style={{ animation: 'spin 0.8s linear infinite' }} width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1.5A6 6 0 1113.5 7.5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Submitting…
            </span>
          ) : `Submit ${isCollection ? 'Collection' : 'Expense'}`}
        </button>
      </div>
    </form>
  );
}
