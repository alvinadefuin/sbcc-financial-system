import React, { useState, useEffect } from "react";
import { Lock, Mail, ArrowRight, AlertCircle, Chrome } from "lucide-react";
import apiService from "../utils/api";

const Login = ({ onLogin, onError }) => {
  const [loginMethod, setLoginMethod] = useState("google");
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleConfig, setGoogleConfig] = useState(null);

  const initializeGoogle = () => {
    if (!window.google || !window.google.accounts || !googleConfig?.clientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      if (loginMethod === "google") {
        setTimeout(() => {
          const buttonDiv = document.getElementById("google-signin-button");
          if (buttonDiv) {
            buttonDiv.innerHTML = "";
            try {
              window.google.accounts.id.renderButton(buttonDiv, {
                theme: "outline",
                size: "large",
                type: "standard",
                text: "signin_with",
                shape: "rectangular",
                logo_alignment: "left",
                width: "100%",
              });
            } catch {
              showCustomGoogleButton(buttonDiv);
            }
          }
        }, 300);
      }
    } catch {
      const buttonDiv = document.getElementById("google-signin-button");
      if (buttonDiv) showCustomGoogleButton(buttonDiv);
    }
  };

  useEffect(() => {
    const loadGoogleConfig = async () => {
      try {
        const config = await apiService.getGoogleConfig();
        setGoogleConfig(config);
      } catch {
        setError("Failed to load Google authentication. Please use password login.");
      }
    };
    loadGoogleConfig();
  }, []);

  useEffect(() => {
    if (googleConfig?.configured && googleConfig?.clientId) {
      const checkAndInitialize = () => {
        if (window.google && window.google.accounts) {
          initializeGoogle();
        } else {
          setTimeout(checkAndInitialize, 500);
        }
      };
      setTimeout(checkAndInitialize, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConfig, loginMethod]);

  const showCustomGoogleButton = (buttonDiv) => {
    buttonDiv.innerHTML = `
      <div class="text-center py-4">
        <p class="text-xs text-rose-600 mb-1">Google Sign-In not loading</p>
        <p class="text-xs text-slate-400">Use password login below</p>
      </div>
    `;
  };

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiService.googleLogin(response.credential);
      onLogin(result.user);
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. Contact an administrator to get access.");
      } else {
        setError("Google sign-in failed. Please try again.");
      }
      onError && onError(err.response?.data?.error || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!credentials.email || !credentials.password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await apiService.login(credentials.email, credentials.password);
      onLogin(result.user);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Login failed");
      onError && onError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] bg-slate-950 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50 ring-1 ring-indigo-500/30">
            <Lock className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-base tracking-tight">SBCC Financial</span>
        </div>
        <div className="relative">
          <p className="text-indigo-400/70 text-xs mb-5 uppercase tracking-[0.2em] font-bold">
            Church Financial Management
          </p>
          <h2 className="text-4xl font-bold text-white leading-[1.15] mb-5 tracking-tight">
            Stewardship,<br />simplified.
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Track collections, monitor expenses, and generate reports — all in one secure place for SBCC.
          </p>
        </div>
        <p className="relative text-slate-600 text-xs font-medium">
          © {new Date().getFullYear()} SBCC. All rights reserved.
        </p>
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <span className="text-slate-900 font-bold text-base tracking-tight">SBCC Financial</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1.5 tracking-tight">Welcome back</h1>
          <p className="text-slate-400 text-sm mb-7">Sign in to your account to continue</p>

          {/* Tab switcher */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setLoginMethod("google"); setError(""); }}
              disabled={!googleConfig?.configured}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "google"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"}`}
            >
              <Chrome className="w-4 h-4" />
              Google
            </button>
            <button
              onClick={() => { setLoginMethod("password"); setError(""); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "password"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"}`}
            >
              Password
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          )}

          {/* Google sign-in */}
          {loginMethod === "google" && (
            <div className="space-y-4">
              {googleConfig?.configured ? (
                <>
                  <div id="google-signin-button" className="w-full flex justify-center" />
                  <p className="text-xs text-slate-400 text-center">Only approved Google accounts can sign in</p>
                </>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-6 text-center">
                  <p className="text-sm text-slate-600 mb-1 font-medium">Google OAuth is not configured</p>
                  <p className="text-xs text-slate-400">Contact your administrator or use password login</p>
                </div>
              )}
            </div>
          )}

          {/* Password sign-in */}
          {loginMethod === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={credentials.email}
                    onChange={(e) => { setCredentials({ ...credentials, email: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-slate-50 focus:bg-white"
                    placeholder="you@sbcc.church"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => { setCredentials({ ...credentials, password: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-slate-50 focus:bg-white"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold py-3 px-4 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Default: admin@sbcc.church / admin123
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
