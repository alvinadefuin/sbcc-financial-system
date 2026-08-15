import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getGuideTopics } from '../content/guideContent';

const HelpGuide = ({ role }) => {
  const [openIds, setOpenIds] = useState([]);
  const groups = getGuideTopics({ platform: 'desktop', role });

  const toggle = (id) =>
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((openId) => openId !== id) : [...prev, id]
    );

  return (
    <div className="max-w-3xl space-y-8">
      {groups.map(({ group, topics }) => (
        <section key={group}>
          <h3 className="text-[10px] font-bold text-[#b89048] uppercase tracking-widest mb-3">
            {group}
          </h3>

          <div className="space-y-2">
            {topics.map((topic) => {
              const open = openIds.includes(topic.id);
              const panelId = `guide-panel-${topic.id}`;

              return (
                <div
                  key={topic.id}
                  className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(topic.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#fff3d8] transition"
                  >
                    <span className="w-9 h-9 rounded-xl border border-[#e8d090] flex items-center justify-center flex-shrink-0 text-[#c49030] bg-[#fffdf5]">
                      <topic.icon className="w-4 h-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#3d2a08]">{topic.title}</span>
                      <span className="block text-xs text-[#8a6028] mt-0.5">{topic.summary}</span>
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 text-[#b89048] flex-shrink-0 transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {open && (
                    <div id={panelId} className="px-4 pb-4 pt-3 border-t border-[#f0e4b0]">
                      <ol className="list-decimal ml-5 space-y-1.5 text-sm text-[#3d2a08]">
                        {topic.steps.map((step, index) => (
                          <li key={index} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>

                      {topic.hint && (
                        <p
                          className="mt-3 text-xs rounded-xl px-3 py-2.5 leading-relaxed"
                          style={{
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
        </section>
      ))}
    </div>
  );
};

export default HelpGuide;
