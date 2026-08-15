import React, { useState, useEffect } from "react";
import "./App.css";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import MobileLayout from "./components/mobile/MobileLayout";
import apiService from "./utils/api";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = window.location.pathname === '/mobile';

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fef9f0' }}>
        <div className="text-center">
          <div
            className="w-9 h-9 border-2 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: '#f0e4b0', borderTopColor: '#d4a843' }}
          />
          <p className="text-sm font-medium tracking-tight" style={{ color: '#b89048' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isMobile) {
    return <MobileLayout user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="App">
      <Dashboard user={user} onLogout={handleLogout} />
    </div>
  );
}

export default App;
