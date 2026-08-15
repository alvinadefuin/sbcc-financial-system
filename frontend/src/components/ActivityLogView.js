import React, { useCallback, useEffect, useState } from "react";
import apiService from "../utils/api";

const PAGE_SIZE = 50;

const ACTION_LABELS = {
  "record.create": "Record created",
  "record.update": "Record updated",
  "record.delete": "Record deleted",
  "user.create": "User created",
  "user.update": "User updated",
  "auth.login_success": "Signed in",
  "auth.login_failed": "Sign-in failed",
  "auth.password_change": "Password changed",
};

const ACTION_TONE = {
  "record.create": "#2f7a44",
  "record.update": "#b8860b",
  "record.delete": "#b3452f",
  "auth.login_failed": "#b3452f",
};

const formatWhen = (value) => {
  const when = new Date(value);
  return Number.isNaN(when.getTime())
    ? String(value)
    : when.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

const formatValue = (value) => (value === null || value === undefined ? "—" : String(value));

const ActivityLogView = () => {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getActivity({
        entity_type: entityType || undefined,
        actor_email: actorEmail || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError("Could not load the activity log. Please try again.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, actorEmail, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onFilterChange = (setter) => (event) => {
    setOffset(0);
    setter(event.target.value);
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="bg-white rounded-2xl border border-[#e8d090] overflow-hidden">
      <div className="flex flex-wrap gap-3 items-end p-4 border-b border-[#f0e4b0]">
        <div className="flex flex-col gap-1">
          <label htmlFor="activity-type" className="text-xs font-semibold text-[#b89048]">Type</label>
          <select
            id="activity-type"
            value={entityType}
            onChange={onFilterChange(setEntityType)}
            className="text-sm border border-[#e8d090] rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">All activity</option>
            <option value="collection">Collections</option>
            <option value="expense">Expenses</option>
            <option value="user">Users</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="activity-actor" className="text-xs font-semibold text-[#b89048]">Actor email</label>
          <input
            id="activity-actor"
            type="text"
            value={actorEmail}
            onChange={onFilterChange(setActorEmail)}
            placeholder="anyone"
            className="text-sm border border-[#e8d090] rounded-lg px-2 py-1.5"
          />
        </div>
      </div>

      {error && <p className="p-4 text-sm text-[#b3452f]">{error}</p>}
      {!error && loading && <p className="p-4 text-sm text-[#b89048]">Loading activity…</p>}
      {!error && !loading && entries.length === 0 && (
        <p className="p-4 text-sm text-[#8a6a2a]">No activity recorded yet.</p>
      )}

      {!error && !loading && entries.length > 0 && (
        <ul className="divide-y divide-[#f0e4b0]">
          {entries.map((entry) => {
            const label = ACTION_LABELS[entry.action] || entry.action;
            return (
            <li key={entry.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: ACTION_TONE[entry.action] || "#8a6a2a" }}
                >
                  {label}
                </span>
                {/* A bare sign-in's summary is the label verbatim — don't say it twice. */}
                {entry.summary && entry.summary !== label && (
                  <span className="text-sm text-[#3d2a08]">{entry.summary}</span>
                )}
                <span className="text-xs text-[#b89048] ml-auto">{formatWhen(entry.occurred_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#8a6a2a]">
                <span>{entry.actor_email || "unknown"}</span>
                {entry.actor_role && <span>({entry.actor_role})</span>}
                {entry.entity_type && (
                  <span>
                    {entry.entity_type} #{entry.entity_id}
                  </span>
                )}
                {entry.changes && (
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    aria-label={`Details for entry ${entry.id}`}
                    className="underline text-[#b8860b]"
                  >
                    {expanded.has(entry.id) ? "Hide details" : "Show details"}
                  </button>
                )}
              </div>

              {entry.changes && expanded.has(entry.id) && (
                <table className="mt-2 text-xs w-full">
                  <tbody>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                      <tr key={field}>
                        <td className="py-0.5 pr-3 font-medium text-[#8a6a2a]">{field}</td>
                        <td className="py-0.5 pr-3 text-[#b3452f]">{formatValue(diff.from)}</td>
                        <td className="py-0.5 text-[#2f7a44]">{formatValue(diff.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between p-4 border-t border-[#f0e4b0] text-xs text-[#8a6a2a]">
        <span>
          {total === 0 ? "0 entries" : `Showing ${pageStart}–${pageEnd} of ${total}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded-lg border border-[#e8d090] disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="px-3 py-1.5 rounded-lg border border-[#e8d090] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogView;
