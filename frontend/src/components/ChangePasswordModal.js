import React, { useState } from "react";
import apiService from "../utils/api";

const MIN_LENGTH = 8;

const ChangePasswordModal = ({ onClose }) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await apiService.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not change the password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (id, label, value, setter) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-[#b89048]">{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => setter(e.target.value)}
        className="text-sm border border-[#e8d090] rounded-lg px-3 py-2"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(61,42,8,0.35)" }}>
      <div className="bg-white rounded-2xl border border-[#e8d090] w-full max-w-sm p-5">
        <h2 className="text-base font-bold text-[#3d2a08] mb-4">Change password</h2>

        {done ? (
          <>
            <p className="text-sm text-[#3d2a08] mb-4">
              Password changed. You have been signed out on your other devices.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#b8860b" }}
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {field("current-password", "Current password", current, setCurrent)}
            {field("new-password", "New password", next, setNext)}
            {field("confirm-password", "Confirm new password", confirm, setConfirm)}

            {error && <p className="text-sm text-[#b3452f]">{error}</p>}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg border border-[#e8d090] text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#b8860b" }}
              >
                {saving ? "Changing…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
