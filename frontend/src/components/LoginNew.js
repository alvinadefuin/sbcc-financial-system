import React, { useState, useEffect } from "react";
import { LogIn, Mail, Lock, AlertCircle, Shield } from "lucide-react";
import apiService from "../utils/api";

const LoginNew = ({ onLogin, onError }) => {
  const [loginMethod, setLoginMethod] = useState("google"); // 'google' or 'password'
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleConfig, setGoogleConfig] = useState(null);

  useEffect(() => {
    // Load Google OAuth config
    const loadGoogleConfig = async () => {
      try {
        console.log("Loading Google config...");
        const config = await apiService.getGoogleConfig();
        console.log("Google config loaded:", config);
        setGoogleConfig(config);
        
        if (config.configured && config.clientId) {
          console.log("Google OAuth is configured");
          // Don't load external script, just show custom button
          setTimeout(() => {
            const buttonDiv = document.getElementById('google-signin-button');
            if (buttonDiv) {
              showCustomGoogleButton(buttonDiv);
            }
          }, 100);
        } else {
          console.log("Google OAuth not configured or missing client ID");
        }
      } catch (error) {
        console.error("Failed to load Google config:", error);
        setError("Failed to load Google authentication. Please refresh the page.");
      }
    };

    loadGoogleConfig();
  }, []);

  const initializeGoogle = () => {
    console.log("Initializing Google Identity Services...");
    console.log("window.google:", window.google);
    console.log("googleConfig:", googleConfig);
    
    if (window.google && window.google.accounts && googleConfig?.clientId) {
      console.log("Initializing with client ID:", googleConfig.clientId);
      
      try {
        window.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Wait a bit for the button div to be rendered
        setTimeout(() => {
          const buttonDiv = document.getElementById('google-signin-button');
          console.log("Button div found:", buttonDiv);
          
          if (buttonDiv) {
            try {
              window.google.accounts.id.renderButton(buttonDiv, {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: '100%',
              });
              console.log("Google Sign-In button rendered");
            } catch (renderError) {
              console.error("Error rendering Google button:", renderError);
              // Fallback: show a custom button
              showCustomGoogleButton(buttonDiv);
            }
          } else {
            console.error("Could not find google-signin-button element");
          }
        }, 100);
      } catch (error) {
        console.error("Error initializing Google Identity Services:", error);
      }
    } else {
      console.error("Missing window.google.accounts or googleConfig.clientId");
      // Fallback for when Google services don't load
      setTimeout(() => {
        const buttonDiv = document.getElementById('google-signin-button');
        if (buttonDiv) {
          showCustomGoogleButton(buttonDiv);
        }
      }, 100);
    }
  };

  const showCustomGoogleButton = (buttonDiv) => {
    buttonDiv.innerHTML = `
      <button id="custom-google-signin" class="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
        <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
    `;
    
    document.getElementById('custom-google-signin').addEventListener('click', () => {
      setError("For now, please use password login. Google OAuth will be fully functional soon. Use: admin@sbcc.church / admin123");
      setLoginMethod("password");
    });
  };

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setError("");

    try {
      const result = await apiService.googleLogin(response.credential);
      onLogin(result.user);
    } catch (error) {
      console.error("Google login failed:", error);
      if (error.response?.status === 403) {
        setError("Access denied. Please contact an administrator to get access.");
      } else {
        setError("Google sign-in failed. Please try again.");
      }
      onError && onError(error.response?.data?.error || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await apiService.login(formData.email, formData.password);
      onLogin(response.user);
    } catch (error) {
      console.error("Login failed:", error);
      setError(error.response?.data?.error || "Login failed");
      onError && onError(error.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            SBCC Financial System
          </h1>
          <p className="text-gray-600">
            Sign in to access the church financial management system
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Login Method Selector */}
          <div className="mb-6">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setLoginMethod("google")}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  loginMethod === "google"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                disabled={!googleConfig?.configured}
              >
                Google Account
              </button>
              <button
                onClick={() => setLoginMethod("password")}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  loginMethod === "password"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Password
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Google Sign-In */}
          {loginMethod === "google" && (
            <div className="space-y-4">
              {googleConfig?.configured ? (
                <>
                  <div 
                    id="google-signin-button" 
                    className="w-full flex justify-center"
                  ></div>
                  <p className="text-xs text-gray-500 text-center">
                    Only Gmail accounts and approved Google Workspace accounts can sign in
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">Google OAuth is not configured</p>
                  <p className="text-xs text-gray-400">
                    Contact your administrator to set up Google authentication
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Password Sign-In */}
          {loginMethod === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your email"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Signing in...
                  </div>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </>
                )}
              </button>
            </form>
          )}

          {/* Development Info */}
          {loginMethod === "password" && (
            <div className="mt-6 p-3 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-600 text-center">
                <strong>Development Access:</strong><br />
                Email: admin@sbcc.church<br />
                Password: admin123
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500">
            © 2025 SBCC Financial System. Secure church financial management.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginNew;