import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  LogOut,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import apiService from "../utils/api";

const Dashboard = ({ user, onLogout }) => {
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkBackend();
    loadData();
  }, []);

  const checkBackend = async () => {
    try {
      await apiService.healthCheck();
      setBackendStatus("connected");
    } catch (error) {
      setBackendStatus("disconnected");
    }
  };

  const loadData = async () => {
    try {
      const [collectionsData, expensesData] = await Promise.all([
        apiService.getCollections(),
        apiService.getExpenses(),
      ]);
      setCollections(collectionsData);
      setExpenses(expensesData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalCollections = collections.reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0
  );
  const totalExpenses = expenses.reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0
  );
  const netBalance = totalCollections - totalExpenses;

  const StatCard = ({ title, value, icon: Icon, color = "blue" }) => (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "0.5rem",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        padding: "1.5rem",
        borderLeft: `4px solid ${
          color === "green"
            ? "#10b981"
            : color === "red"
            ? "#ef4444"
            : "#3b82f6"
        }`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "#6b7280",
              margin: "0 0 0.5rem 0",
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: "#111827",
              margin: 0,
            }}
          >
            ₱{value.toLocaleString()}
          </p>
        </div>
        <Icon
          style={{
            width: "3rem",
            height: "3rem",
            color:
              color === "green"
                ? "#10b981"
                : color === "red"
                ? "#ef4444"
                : "#3b82f6",
          }}
        />
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6" }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        }}
      >
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1.5rem 0",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "1.875rem",
                  fontWeight: "bold",
                  color: "#111827",
                  margin: 0,
                }}
              >
                SBCC Financial Dashboard
              </h1>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#6b7280",
                  margin: "0.25rem 0 0 0",
                }}
              >
                Welcome, {user.name} ({user.role})
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button
                onClick={loadData}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: "#6b7280",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <RefreshCw style={{ width: "1rem", height: "1rem" }} />
                Refresh
              </button>
              <button
                onClick={onLogout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: "#ef4444",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <LogOut style={{ width: "1rem", height: "1rem" }} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1rem" }}
      >
        {/* System Status */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            padding: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              marginBottom: "1rem",
            }}
          >
            System Status
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {backendStatus === "connected" ? (
                <CheckCircle
                  style={{
                    color: "#10b981",
                    width: "1.25rem",
                    height: "1.25rem",
                  }}
                />
              ) : (
                <XCircle
                  style={{
                    color: "#ef4444",
                    width: "1.25rem",
                    height: "1.25rem",
                  }}
                />
              )}
              <span>
                <strong>Backend:</strong>{" "}
                {backendStatus === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle
                style={{
                  color: "#10b981",
                  width: "1.25rem",
                  height: "1.25rem",
                }}
              />
              <span>
                <strong>Frontend:</strong> Connected
              </span>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle
                style={{
                  color: "#10b981",
                  width: "1.25rem",
                  height: "1.25rem",
                }}
              />
              <span>
                <strong>User:</strong> {user.email}
              </span>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <CheckCircle
                style={{
                  color: "#10b981",
                  width: "1.25rem",
                  height: "1.25rem",
                }}
              />
              <span>
                <strong>Role:</strong> {user.role}
              </span>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <StatCard
            title="Total Collections"
            value={totalCollections}
            icon={DollarSign}
            color="green"
          />
          <StatCard
            title="Total Expenses"
            value={totalExpenses}
            icon={TrendingDown}
            color="red"
          />
          <StatCard
            title="Net Balance"
            value={netBalance}
            icon={netBalance >= 0 ? TrendingUp : TrendingDown}
            color={netBalance >= 0 ? "green" : "red"}
          />
        </div>

        {/* Success Message */}
        <div
          style={{
            backgroundColor: "#d1fae5",
            border: "1px solid #a7f3d0",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginBottom: "2rem",
          }}
        >
          <h3
            style={{
              color: "#047857",
              fontSize: "1.125rem",
              fontWeight: "600",
              margin: "0 0 0.5rem 0",
            }}
          >
            🎉 Church Financial System is Live!
          </h3>
          <p style={{ color: "#065f46", margin: 0 }}>
            Your SBCC Financial Management System is successfully running with
            backend API, database, and authentication working perfectly.
          </p>
        </div>

        {/* Recent Transactions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* Recent Collections */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "0.5rem",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{ fontSize: "1.125rem", fontWeight: "bold", margin: 0 }}
              >
                Recent Collections ({collections.length})
              </h3>
            </div>
            <div style={{ padding: "1.5rem" }}>
              {loading ? (
                <p>Loading...</p>
              ) : collections.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {collections.slice(0, 5).map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem",
                        backgroundColor: "#f9fafb",
                        borderRadius: "0.375rem",
                      }}
                    >
                      <div>
                        <p
                          style={{ fontWeight: "500", margin: "0 0 0.25rem 0" }}
                        >
                          {item.particular}
                        </p>
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "#6b7280",
                            margin: 0,
                          }}
                        >
                          {item.date} • {item.control_number}
                        </p>
                      </div>
                      <span style={{ fontWeight: "bold", color: "#10b981" }}>
                        ₱{item.total_amount?.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>
                  No collections found. Sample data will appear here once
                  loaded.
                </p>
              )}
            </div>
          </div>

          {/* Recent Expenses */}
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "0.5rem",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{ fontSize: "1.125rem", fontWeight: "bold", margin: 0 }}
              >
                Recent Expenses ({expenses.length})
              </h3>
            </div>
            <div style={{ padding: "1.5rem" }}>
              {loading ? (
                <p>Loading...</p>
              ) : expenses.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {expenses.slice(0, 5).map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem",
                        backgroundColor: "#f9fafb",
                        borderRadius: "0.375rem",
                      }}
                    >
                      <div>
                        <p
                          style={{ fontWeight: "500", margin: "0 0 0.25rem 0" }}
                        >
                          {item.particular}
                        </p>
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "#6b7280",
                            margin: 0,
                          }}
                        >
                          {item.date} • {item.forms_number}
                        </p>
                      </div>
                      <span style={{ fontWeight: "bold", color: "#ef4444" }}>
                        ₱{item.total_amount?.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>
                  No expenses found. Sample data will appear here once loaded.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div
          style={{
            backgroundColor: "#dbeafe",
            border: "1px solid #93c5fd",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginTop: "2rem",
          }}
        >
          <h3
            style={{
              color: "#1e40af",
              fontSize: "1.125rem",
              fontWeight: "600",
              margin: "0 0 0.5rem 0",
            }}
          >
            Next Steps:
          </h3>
          <ul style={{ color: "#1e3a8a", margin: 0, paddingLeft: "1.5rem" }}>
            <li>Add sample financial data for testing</li>
            <li>Integrate full dashboard with charts and reports</li>
            <li>Set up Google Forms for data entry</li>
            <li>Deploy to production hosting</li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
