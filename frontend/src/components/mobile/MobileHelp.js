import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { getGuideTopics } from '../../content/guideContent';

export default function MobileHelp({ onClose }) {
  const [openIds, setOpenIds] = useState([]);

  // Every mobile topic is minRole 'user'; passing it explicitly keeps the
  // call honest if that ever changes.
  const groups = getGuideTopics({ platform: 'mobile', role: 'user' });

  const toggle = (id) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]
    );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        background: '#fef9f0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Overlay header */}
      <div
        style={{
          padding: '14px 16px',
          flexShrink: 0,
          background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)',
          borderBottom: '1px solid #e8d090',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3d2a08' }}>
          How to use this app
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(196,144,48,0.08)',
            border: '1px solid #e8d090',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <X size={16} style={{ color: '#8a6028' }} />
        </button>
      </div>

      {/* Scrolling topic list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 28px' }}>
        {groups.map(({ group, topics }) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <p
              style={{
                margin: '0 0 8px 2px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#b89048',
              }}
            >
              {group}
            </p>

            {topics.map((topic) => {
              const open = openIds.includes(topic.id);
              const panelId = `mobile-guide-panel-${topic.id}`;

              return (
                <div
                  key={topic.id}
                  style={{
                    background: '#fff8e6',
                    border: '1px solid #e8d090',
                    borderRadius: 12,
                    marginBottom: 8,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => toggle(topic.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 12px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: '#fffdf5',
                        border: '1px solid #e8d090',
                        flexShrink: 0,
                      }}
                    >
                      <topic.icon size={17} style={{ color: '#c49030' }} />
                    </span>

                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#3d2a08',
                          lineHeight: 1.3,
                        }}
                      >
                        {topic.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: '#8a6028',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {topic.summary}
                      </span>
                    </span>

                    <ChevronDown
                      size={16}
                      style={{
                        color: '#b89048',
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>

                  {open && (
                    <div
                      id={panelId}
                      style={{ padding: '10px 14px 14px', borderTop: '1px solid #f0e4b0' }}
                    >
                      <ol style={{ margin: 0, paddingLeft: 18, color: '#3d2a08' }}>
                        {topic.steps.map((step, index) => (
                          <li
                            key={index}
                            style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}
                          >
                            {step}
                          </li>
                        ))}
                      </ol>

                      {topic.hint && (
                        <p
                          style={{
                            margin: '10px 0 0',
                            fontSize: 12,
                            lineHeight: 1.5,
                            padding: '9px 11px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #fff8e0, #fdefc0)',
                            border: '1px solid #e8c870',
                            color: '#8a6028',
                          }}
                        >
                          {topic.hint}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
