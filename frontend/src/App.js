import React, { useState, useEffect } from "react";
import "./App.css";
import Login from "./components/Login";
import apiService from "./utils/api";

// Temporary simple dashboard - we'll replace this with the full dashboard later
const SimpleDashboard = ({ user, onLogout }) => {
  const [backendStatus, setBackendStatus] = useState("checking...");

  useEffect(() => {
    checkBackend();
  }, []);

  const checkBackend = async () => {
    try {
      const health = await apiService.healthCheck();
      setBackendStatus("✅ Connected");
    } catch (error) {
      setBackendStatus("❌ Backend not running");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              SBCC Financial Dashboard
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user.name} ({user.role})
              </span>
              <button
                onClick={onLogout}
                className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 className="text-xl font-semibold mb-4">System Status</h2>
            <div className="space-y-2">
              <p>
                <strong>Backend:</strong> {backendStatus}
              </p>
              <p>
                <strong>User:</strong> {user.email}
              </p>
              <p>
                <strong>Role:</strong> {user.role}
              </p>
              <p>
                <strong>Frontend:</strong> ✅ React App Running
              </p>
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="text-lg font-medium text-green-800 mb-2">
                🎉 Setup Complete!
              </h3>
              <p className="text-green-700">
                Your SBCC Financial System is running successfully. The full
                dashboard with charts and reports will be integrated next.
              </p>
            </div>

            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="text-lg font-medium text-blue-800 mb-2">
                Next Steps:
              </h3>
              <ul className="text-blue-700 space-y-1">
                <li>• Add collections and expenses routes to backend</li>
                <li>• Integrate the full dashboard component</li>
                <li>• Set up Google Forms integration</li>
                <li>• Deploy to production</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const userData = await apiService.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      localStorage.removeItem("authToken");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    apiService.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <SimpleDashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
