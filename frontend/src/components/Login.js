import React, { useState } from "react";
import { User, Lock, LogIn } from "lucide-react";
import apiService from "../utils/api";

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    email: "admin@sbcc.church",
    password: "admin123",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await apiService.login(
        credentials.email,
        credentials.password
      );
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            SBCC Financial System
          </h1>
          <p className="text-gray-600">Sign in to access the dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "0.25rem",
              }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <User
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "0.75rem",
                  height: "1rem",
                  width: "1rem",
                  color: "#9ca3af",
                }}
              />
              <input
                type="email"
                value={credentials.email}
                onChange={(e) =>
                  setCredentials({ ...credentials, email: e.target.value })
                }
                style={{
                  width: "100%",
                  paddingLeft: "2.5rem",
                  paddingRight: "0.75rem",
                  paddingTop: "0.5rem",
                  paddingBottom: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  boxSizing: "border-box",
                }}
                required
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "0.25rem",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "0.75rem",
                  height: "1rem",
                  width: "1rem",
                  color: "#9ca3af",
                }}
              />
              <input
                type="password"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials({ ...credentials, password: e.target.value })
                }
                style={{
                  width: "100%",
                  paddingLeft: "2.5rem",
                  paddingRight: "0.75rem",
                  paddingTop: "0.5rem",
                  paddingBottom: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  boxSizing: "border-box",
                }}
                required
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "0.375rem",
                padding: "0.75rem",
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: loading ? "#9ca3af" : "#2563eb",
              color: "white",
              paddingTop: "0.5rem",
              paddingBottom: "0.5rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              borderRadius: "0.375rem",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <LogIn style={{ height: "1rem", width: "1rem" }} />
            <span>{loading ? "Signing in..." : "Sign In"}</span>
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
            Default: admin@sbcc.church / admin123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
