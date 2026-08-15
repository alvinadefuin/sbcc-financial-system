import React, { useState, useEffect, useRef } from "react";
import { Lock, Mail, ArrowRight, AlertCircle, Chrome } from "lucide-react";
import apiService from "../utils/api";

const Login = ({ onLogin, onError }) => {
  const [loginMethod, setLoginMethod] = useState("google");
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleConfig, setGoogleConfig] = useState(null);
  const initialisedRef = useRef(false);

  const initializeGoogle = () => {
    if (!window.google || !window.google.accounts || !googleConfig?.clientId) return;

    try {
      // GSI warns when initialize() is called twice. This effect re-runs on every
      // loginMethod toggle, so only the button needs re-rendering after the first.
      if (!initialisedRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initialisedRef.current = true;
      }

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
                width: 320,
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
    <div className="min-h-screen flex" style={{ background: '#fef9f0' }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(196,144,48,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div className="relative flex items-center gap-3">
          <img src="/sb-icon.png" alt="StewardBox" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <span className="font-bold text-base tracking-tight" style={{ color: '#3d2a08' }}>StewardBox</span>
        </div>
        <div className="relative text-center">
          <img src="/sb-collection.png" alt="StewardBox character"
            style={{ width: 120, height: 120, objectFit: 'contain', margin: '0 auto 24px', filter: 'drop-shadow(0 8px 24px rgba(180,120,20,0.25))' }} />
          <p className="text-xs mb-4 uppercase tracking-[0.2em] font-bold" style={{ color: '#b89048' }}>
            Church Financial Management
          </p>
          <h2 className="text-4xl font-bold leading-[1.15] mb-2 tracking-tight" style={{ color: '#3d2a08' }}>
            StewardBox
          </h2>
          <p className="text-sm font-medium mb-5" style={{ color: '#8a6028' }}>by EmmTee</p>
          <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#b89048' }}>
            Track collections, monitor expenses, and generate reports — all in one secure place.
          </p>
        </div>
        <p className="relative text-xs font-medium" style={{ color: '#c4a060' }}>
          © {new Date().getFullYear()} SBCC · Developed by Alvin Adefuin
        </p>
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#fff' }}>
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile hero */}
          <div className="flex flex-col items-center mb-8 lg:hidden"
            style={{ background: 'linear-gradient(160deg, #fff8e0, #fde8b0)', borderRadius: 20, padding: '28px 20px 24px', marginBottom: 32, border: '1px solid #e8d090' }}>
            <img src="/sb-collection.png" alt="StewardBox" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 12, filter: 'drop-shadow(0 4px 12px rgba(180,120,20,0.2))' }} />
            <h1 className="font-bold text-xl tracking-tight" style={{ color: '#3d2a08', margin: 0 }}>StewardBox</h1>
            <p className="text-sm" style={{ color: '#8a6028', margin: '2px 0 0' }}>by EmmTee</p>
          </div>

          <h1 className="text-2xl font-bold mb-1.5 tracking-tight" style={{ color: '#3d2a08' }}>Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: '#b89048' }}>Sign in to your account to continue</p>

          {/* Tab switcher */}
          <div className="flex p-1 mb-6 rounded-xl" style={{ background: '#fff8e6', border: '1px solid #f0e4b0' }}>
            <button
              onClick={() => { setLoginMethod("google"); setError(""); }}
              disabled={!googleConfig?.configured}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "google"
                  ? "bg-white shadow-sm"
                  : "disabled:opacity-40 disabled:cursor-not-allowed"}`}
              style={{ color: loginMethod === "google" ? '#3d2a08' : '#b89048' }}
            >
              <Chrome className="w-4 h-4" />
              Google
            </button>
            <button
              onClick={() => { setLoginMethod("password"); setError(""); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "password" ? "bg-white shadow-sm" : ""}`}
              style={{ color: loginMethod === "password" ? '#3d2a08' : '#b89048' }}
            >
              Password
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5" style={{ background: '#fff1f0', border: '1px solid #f5c0b8' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#c04828' }} />
              <p className="text-sm font-medium" style={{ color: '#9a2a18' }}>{error}</p>
            </div>
          )}

          {/* Google sign-in */}
          {loginMethod === "google" && (
            <div className="space-y-4">
              {googleConfig?.configured ? (
                <>
                  <div id="google-signin-button" className="w-full flex justify-center" />
                  <p className="text-xs text-center" style={{ color: '#b89048' }}>Only approved Google accounts can sign in</p>
                </>
              ) : (
                <div className="rounded-xl px-4 py-6 text-center" style={{ background: '#fff8e6', border: '1px solid #e8d090' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: '#8a6028' }}>Google OAuth is not configured</p>
                  <p className="text-xs" style={{ color: '#b89048' }}>Contact your administrator or use password login</p>
                </div>
              )}
            </div>
          )}

          {/* Password sign-in */}
          {loginMethod === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8a6028' }}>
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#b89048' }} />
                  <input
                    type="email"
                    value={credentials.email}
                    onChange={(e) => { setCredentials({ ...credentials, email: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition"
                    style={{ border: '1.5px solid #e8d090', background: '#fff8e6', color: '#3d2a08', outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = '#c49030'; e.target.style.boxShadow = '0 0 0 3px rgba(196,144,48,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#e8d090'; e.target.style.boxShadow = 'none'; }}
                    placeholder="you@sbcc.church"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8a6028' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#b89048' }} />
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => { setCredentials({ ...credentials, password: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition"
                    style={{ border: '1.5px solid #e8d090', background: '#fff8e6', color: '#3d2a08', outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = '#c49030'; e.target.style.boxShadow = '0 0 0 3px rgba(196,144,48,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#e8d090'; e.target.style.boxShadow = 'none'; }}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 px-4 rounded-xl transition focus:outline-none"
                style={{
                  background: loading ? '#f0e4b0' : 'linear-gradient(135deg, #d4a843, #c49030)',
                  color: loading ? '#b89048' : '#fff',
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(196,144,48,0.35)',
                }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(196,144,48,0.3)', borderTopColor: '#c49030' }} />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
