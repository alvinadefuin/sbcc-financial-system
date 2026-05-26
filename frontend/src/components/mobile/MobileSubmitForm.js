import React, { useState } from 'react';
import apiService from '../../utils/api';

const EXPENSE_CATEGORIES = [
  'workers_share', 'supplies', 'utilities', 'building_maintenance',
  'vehicle_maintenance', 'transportation_gas', 'honorarium',
  'fellowship_events', 'abccop_national', 'cbcc_share', 'kabalikat_share',
];

const INITIAL_COLLECTION = {
  date: '', particular: '', control_number: '', payment_method: 'Cash',
  general_tithes_offering: '', bank_interest: '', sisterhood_san_juan: '',
  sisterhood_labuin: '', brotherhood: '', youth: '', couples: '',
  sunday_school: '', special_purpose_pledge: '',
};

const INITIAL_EXPENSE = {
  date: '', particular: '', category: '', cheque_number: '', forms_number: '',
  pbcm_share_expense: '', pastoral_worker_support: '', cap_assistance: '',
  honorarium: '', conference_seminar: '', fellowship_events: '',
  anniversary_christmas: '', supplies: '', utilities: '', vehicle_maintenance: '',
  lto_registration: '', transportation_gas: '', building_maintenance: '',
  abccop_national: '', cbcc_share: '', kabalikat_share: '', abccop_community: '',
};

export default function MobileSubmitForm({ user, onSubmitted }) {
  const [type, setType] = useState('collection');
  const [form, setForm] = useState(INITIAL_COLLECTION);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(false);

  const handleTypeToggle = (t) => {
    setType(t);
    setForm(t === 'collection' ? INITIAL_COLLECTION : INITIAL_EXPENSE);
    setConflict(null);
    setError(null);
    setQueued(false);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

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
        setForm(type === 'collection' ? INITIAL_COLLECTION : INITIAL_EXPENSE);
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

  const handleSubmit = (e) => {
    e.preventDefault();
    doSubmit(false);
  };

  const handleSubmitAnyway = () => {
    setConflict(null);
    doSubmit(true);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700">
        <button
          type="button"
          onClick={() => handleTypeToggle('collection')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            type === 'collection' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Collection
        </button>
        <button
          type="button"
          onClick={() => handleTypeToggle('expense')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            type === 'expense' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Expense
        </button>
      </div>

      {/* Date field */}
      <div>
        <label htmlFor="date" className="block text-xs font-medium text-slate-400 mb-1">
          Date <span className="text-red-400">*</span>
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          value={form.date}
          onChange={handleChange}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>

      {type === 'collection' ? (
        <>
          <div>
            <label htmlFor="general_tithes_offering" className="block text-xs font-medium text-slate-400 mb-1">
              General Tithes &amp; Offering
            </label>
            <input
              id="general_tithes_offering"
              name="general_tithes_offering"
              type="number"
              min="0"
              step="0.01"
              value={form.general_tithes_offering}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="0.00"
            />
          </div>
          {['bank_interest','sisterhood_san_juan','sisterhood_labuin','brotherhood','youth','couples','sunday_school','special_purpose_pledge'].map(field => (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-medium text-slate-400 mb-1 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              <input
                id={field}
                name={field}
                type="number"
                min="0"
                step="0.01"
                value={form[field]}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="0.00"
              />
            </div>
          ))}
          <div>
            <label htmlFor="particular" className="block text-xs font-medium text-slate-400 mb-1">
              Particular / Notes
            </label>
            <input
              id="particular"
              name="particular"
              type="text"
              value={form.particular}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor="payment_method" className="block text-xs font-medium text-slate-400 mb-1">
              Payment Method
            </label>
            <select
              id="payment_method"
              name="payment_method"
              value={form.payment_method}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option>Cash</option>
              <option>Check</option>
              <option>Bank Transfer</option>
              <option>GCash</option>
            </select>
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="category" className="block text-xs font-medium text-slate-400 mb-1">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              value={form.category}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select category</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          {['pbcm_share_expense','pastoral_worker_support','cap_assistance','honorarium','conference_seminar','fellowship_events','anniversary_christmas','supplies','utilities','vehicle_maintenance','lto_registration','transportation_gas','building_maintenance','abccop_national','cbcc_share','kabalikat_share','abccop_community'].map(field => (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-medium text-slate-400 mb-1 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              <input
                id={field}
                name={field}
                type="number"
                min="0"
                step="0.01"
                value={form[field]}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="0.00"
              />
            </div>
          ))}
          <div>
            <label htmlFor="particular" className="block text-xs font-medium text-slate-400 mb-1">
              Particular / Notes
            </label>
            <input
              id="particular"
              name="particular"
              type="text"
              value={form.particular}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {/* Feedback messages */}
      {queued && (
        <p className="text-amber-400 text-sm">Entry saved offline — will sync when connected.</p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Duplicate conflict dialog */}
      {conflict && (
        <div className="p-4 bg-amber-950 border border-amber-700 rounded-lg space-y-3">
          <p className="text-sm text-amber-300">
            A similar entry was already submitted by <strong>{conflict.submitted_by}</strong> on {conflict.date}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmitAnyway}
              className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium"
            >
              Submit Anyway
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="flex-1 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
