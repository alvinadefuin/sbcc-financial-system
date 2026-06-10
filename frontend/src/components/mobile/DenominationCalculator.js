import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

const INITIAL_QTY = () =>
  DENOMINATIONS.reduce((acc, d) => { acc[d] = 0; return acc; }, {});

function formatAmount(val) {
  if (!val) return '₱0';
  return `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function DenominationCalculator({ isOpen, fieldLabel, currentValue, onConfirm, onClose }) {
  const [qty, setQty] = useState(INITIAL_QTY);

  useEffect(() => {
    if (isOpen) {
      setQty(INITIAL_QTY());
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const total = DENOMINATIONS.reduce((sum, d) => sum + d * (qty[d] || 0), 0);

  const adjust = useCallback((denom, delta) => {
    setQty(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
  }, []);

  const handleQtyInput = (denom, val) => {
    const n = parseInt(val, 10);
    setQty(prev => ({ ...prev, [denom]: isNaN(n) || n < 0 ? 0 : n }));
  };

  const handleConfirm = () => {
    onConfirm(total > 0 ? String(total) : '');
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Centering wrapper — portaled to body so maxWidth 430 always centres correctly */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 201,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
      <div
        style={{
          width: '100%', maxWidth: 430,
          pointerEvents: 'auto',
          background: 'rgba(10,10,28,0.97)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '22px 22px 0 0',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header: field label + running total */}
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                {fieldLabel}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                Count denominations below
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>TOTAL</p>
              <p
                className="font-mono-num"
                style={{
                  margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1,
                  color: total > 0 ? '#d4a843' : 'rgba(255,255,255,0.15)',
                  transition: 'color 0.2s',
                }}
              >
                {formatAmount(total)}
              </p>
            </div>
          </div>
        </div>

        {/* Denomination rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {DENOMINATIONS.map(denom => {
            const count = qty[denom] || 0;
            const subtotal = denom * count;
            return (
              <div
                key={denom}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  marginBottom: 6,
                  borderRadius: 13,
                  background: count > 0 ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${count > 0 ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                {/* Denomination label */}
                <div style={{ width: 52, flexShrink: 0 }}>
                  <span
                    className="font-mono-num"
                    style={{
                      fontSize: 15, fontWeight: 600,
                      color: count > 0 ? '#d4a843' : 'rgba(255,255,255,0.5)',
                      transition: 'color 0.15s',
                    }}
                  >
                    ₱{denom >= 1000 ? `${denom / 1000}k` : denom}
                  </span>
                </div>

                {/* Stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1 }}>
                  <StepBtn onClick={() => adjust(denom, -1)} disabled={count === 0} label="−" />
                  <input
                    type="number"
                    min="0"
                    value={count === 0 ? '' : count}
                    onChange={e => handleQtyInput(denom, e.target.value)}
                    placeholder="0"
                    style={{
                      width: 48, textAlign: 'center',
                      background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 17, fontWeight: 600,
                      color: count > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                      fontFamily: 'inherit',
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none',
                    }}
                  />
                  <StepBtn onClick={() => adjust(denom, +1)} label="+" />
                </div>

                {/* Subtotal */}
                <div style={{ width: 64, textAlign: 'right', flexShrink: 0 }}>
                  <span
                    className="font-mono-num"
                    style={{
                      fontSize: 13, fontWeight: 500,
                      color: subtotal > 0 ? 'rgba(212,168,67,0.8)' : 'rgba(255,255,255,0.15)',
                      transition: 'color 0.15s',
                    }}
                  >
                    {subtotal > 0 ? `₱${subtotal.toLocaleString('en-PH')}` : '—'}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ height: 8 }} />
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 16px 0',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setQty(INITIAL_QTY())}
            style={{
              padding: '13px 0', borderRadius: 13,
              flex: '0 0 80px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 13, fontWeight: 500,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 13,
              background: total > 0
                ? 'linear-gradient(135deg, #d4a843 0%, #c49030 100%)'
                : 'rgba(255,255,255,0.06)',
              border: total > 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: total > 0 ? '#0a0a1c' : 'rgba(255,255,255,0.25)',
              fontSize: 15, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {total > 0 ? `Use ${formatAmount(total)}` : 'Use ₱0'}
          </button>
        </div>
      </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
    </>,
    document.body
  );
}

function StepBtn({ onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.14)'}`,
        color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)',
        fontSize: 20, fontWeight: 400,
        fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}
