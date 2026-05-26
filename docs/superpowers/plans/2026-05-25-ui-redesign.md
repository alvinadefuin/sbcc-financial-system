# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the entire SBCC Financial System frontend to a modern, minimalist financial management aesthetic that is fully responsive.

**Architecture:** Replace the current mix of inline styles and Tailwind utility classes with a consistent Tailwind-based design system anchored by CSS custom properties and the Inter font. Each component is rewritten in-place — no new files are created, no routing changes needed. The sidebar layout becomes a true persistent fixed sidebar on desktop and a slide-over drawer on mobile.

**Tech Stack:** React 19, Tailwind CSS 3, Recharts, Lucide React, Inter (Google Fonts)

---

## Design System Reference

Use these values throughout all tasks:

| Token | Value | Usage |
|---|---|---|
| `bg-slate-950` | `#020617` | Sidebar background |
| `bg-slate-800` | `#1E293B` | Sidebar hover / active bg |
| `bg-slate-50` | `#F8FAFC` | Page background |
| `bg-white` | `#FFFFFF` | Card background |
| `border-slate-200` | `#E2E8F0` | Card / input borders |
| `text-slate-900` | `#0F172A` | Primary text |
| `text-slate-500` | `#64748B` | Secondary / muted text |
| `text-blue-600` | `#2563EB` | Primary action / links |
| `text-emerald-600` | `#059669` | Income / positive values |
| `text-rose-600` | `#E11D48` | Expense / negative values |
| `rounded-xl` | `0.75rem` | Card corners |
| `shadow-sm` | subtle | Card shadow (never `shadow-lg`) |

**Typography:** Inter via Google Fonts. Headings: `font-semibold`. Labels: `text-sm font-medium text-slate-500`. Values: `font-bold text-slate-900`.

**Stat card style:** White card, `border border-slate-200 rounded-xl p-6`, left accent bar via `border-l-4`, colored icon in a small rounded square, large number.

**No gradients on cards.** No heavy drop shadows. No `bg-gradient-to-r` on stat cards.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/index.css` | Modify | Add Inter font import, CSS resets |
| `frontend/src/App.js` | Modify | Redesign loading spinner |
| `frontend/src/components/LoginNew.js` | Modify | Full login page redesign |
| `frontend/src/components/Dashboard.js` | Modify | Sidebar, header, stat cards, charts, recent transactions, analytics, reports views |
| `frontend/src/components/FinancialRecordsManagerNew.js` | Modify | Records manager tabs, table, form |
| `frontend/src/components/UserManagement.js` | Modify | User list table and form |
| `frontend/src/components/PrintReportModal.js` | Modify | Modal shell and form |
| `frontend/src/components/UpdateGoogleSheetModal.js` | Modify | Modal shell and form |

---

## Task 1: Create Feature Branch

**Files:** (git only)

- [ ] **Step 1: Create and check out the feature branch**

```bash
git checkout -b feature/ui-redesign
```

Expected output:
```
Switched to a new branch 'feature/ui-redesign'
```

---

## Task 2: Add Inter Font and Design-System CSS

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace the entire contents of `frontend/src/index.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: #F8FAFC;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #CBD5E1 transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 4px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: #CBD5E1;
    border-radius: 2px;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}
```

- [ ] **Step 2: Verify Tailwind still processes correctly**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/frontend && npm start 2>&1 | head -20
```

Wait for "Compiled successfully" in the output (Ctrl+C after confirming, or run in background).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: add Inter font and design-system CSS utilities"
```

---

## Task 3: Redesign App Loading State

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Replace the loading JSX in `App.js` (lines 38–65)**

Find this block:
```jsx
if (loading) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "3rem",
            height: "3rem",
            border: "2px solid #e5e7eb",
            borderTop: "2px solid #3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 1rem auto",
          }}
        ></div>
        <p style={{ color: "#6b7280" }}>Loading SBCC Financial System...</p>
      </div>
    </div>
  );
}
```

Replace with:
```jsx
if (loading) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500 font-medium">Loading SBCC Financial System...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.js
git commit -m "style: redesign app loading state"
```

---

## Task 4: Redesign Login Page

**Files:**
- Modify: `frontend/src/components/LoginNew.js`

- [ ] **Step 1: Replace the entire contents of `frontend/src/components/LoginNew.js`**

```jsx
import React, { useState } from "react";
import { Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
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
      const result = await apiService.login(credentials.email, credentials.password);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-lg">SBCC Financial</span>
          </div>
        </div>
        <div>
          <p className="text-slate-400 text-sm mb-6 uppercase tracking-widest font-medium">
            Church Financial Management
          </p>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Stewardship,<br />simplified.
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Track collections, monitor expenses, and generate reports — all in one secure place for SBCC.
          </p>
        </div>
        <p className="text-slate-600 text-sm">
          © {new Date().getFullYear()} SBCC. All rights reserved.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <span className="text-slate-900 font-semibold text-lg">SBCC Financial</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="you@sbcc.church"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Default: admin@sbcc.church / admin123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
```

- [ ] **Step 2: Verify the app renders without errors**

Open the browser at `http://localhost:3000` and confirm the login page shows a split two-panel layout on desktop and single column on mobile.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LoginNew.js
git commit -m "style: redesign login page with split panel layout"
```

---

## Task 5: Redesign Dashboard — Sidebar & Shell

**Files:**
- Modify: `frontend/src/components/Dashboard.js` (Sidebar component and outer shell, lines 636–789)

This task rewrites the `Sidebar` component and the outer wrapper `return` JSX only. Chart and card content tasks follow.

- [ ] **Step 1: Replace the `Sidebar` component definition (inside Dashboard.js, starting at `const Sidebar = () => (`) with the following**

Find and replace the entire `const Sidebar = () => (...)` block (approximately lines 637–776):

```jsx
const Sidebar = () => (
  <>
    {/* Dark overlay for mobile */}
    {sidebarOpen && (
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={() => setSidebarOpen(false)}
      />
    )}

    <aside
      className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-950 flex flex-col transform transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0 lg:flex
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">SBCC Financial</span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1 rounded text-slate-500 hover:text-slate-300 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3">
        <p className="px-3 mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Overview</p>
        <div className="space-y-0.5">
          {[
            { id: "overview", label: "Dashboard", icon: Home },
            { id: "analytics", label: "Analytics", icon: Activity },
            { id: "reports", label: "Reports", icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setSelectedView(id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition
                ${selectedView === id
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {(user?.role === "admin" || user?.role === "super_admin") && (
          <>
            <p className="px-3 mt-6 mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Management</p>
            <div className="space-y-0.5">
              <button
                onClick={() => { setShowRecordsManager(true); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                Manage Records
              </button>
              <button
                onClick={() => { setShowUserManagement(true); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <Users className="w-4 h-4 flex-shrink-0" />
                User Management
              </button>
              <button
                onClick={() => { setShowGoogleForms(true); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                Google Forms
              </button>
              <button
                onClick={() => { setCustomFieldsTableName("collections"); setShowCustomFieldsManager(true); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                Custom Fields
              </button>
            </div>
          </>
        )}

        <p className="px-3 mt-6 mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</p>
        <div className="space-y-0.5">
          <button
            onClick={handlePrint}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition"
          >
            <Printer className="w-4 h-4 flex-shrink-0" />
            Print Report
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 transition"
          >
            <Power className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-500 capitalize">{user.role}</p>
          </div>
        </div>
      </div>
    </aside>
  </>
);
```

- [ ] **Step 2: Replace the Dashboard outer `return` shell**

Find the outer `return (` of Dashboard (around line 778) and replace the wrapper JSX through to where `{/* Main content */}` starts. The new shell:

```jsx
return (
  <div className="min-h-screen bg-slate-50 flex">
    <Sidebar />

    {/* Main content */}
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                {selectedView === "overview" && "Dashboard"}
                {selectedView === "analytics" && "Analytics"}
                {selectedView === "reports" && "Reports"}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Welcome back, {user.name} · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48 transition"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh"
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
```

Then close the JSX at the end of the component — after `{/* Custom Fields Manager Modal */}` block:
```jsx
        </div>
      </main>
    </div>

    {/* Modals */}
    <PrintReportModal
      isOpen={showPrintModal}
      onClose={() => setShowPrintModal(false)}
      user={user}
    />
    <UpdateGoogleSheetModal
      isOpen={showGoogleSheetsModal}
      onClose={() => setShowGoogleSheetsModal(false)}
      user={user}
    />
    {showCustomFieldsManager && (
      <CustomFieldsManager
        tableName={customFieldsTableName}
        onClose={() => setShowCustomFieldsManager(false)}
      />
    )}
  </div>
);
```

Also remove the old `{/* Sidebar overlay for mobile */}` div (it's now inside the Sidebar component).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign dashboard sidebar and shell layout"
```

---

## Task 6: Redesign Stat Cards

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — `StatCard` component and the grid section

- [ ] **Step 1: Replace the `StatCard` component (around lines 510–546)**

Find `const StatCard = ({`:

```jsx
const StatCard = ({ title, value, icon: Icon, color = "blue", trend = null }) => {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    ...
  };
  return (
    <div className={`bg-gradient-to-r ${colorClasses[color]} rounded-2xl p-6 text-white ...`}>
```

Replace the entire `StatCard` component with:

```jsx
const StatCard = ({ title, value, icon: Icon, accentColor = "blue", trend = null }) => {
  const accent = {
    blue:    { border: "border-l-blue-500",    icon: "bg-blue-50 text-blue-600",    val: "text-slate-900" },
    emerald: { border: "border-l-emerald-500", icon: "bg-emerald-50 text-emerald-600", val: "text-emerald-700" },
    rose:    { border: "border-l-rose-500",    icon: "bg-rose-50 text-rose-600",    val: "text-rose-700" },
    purple:  { border: "border-l-purple-500",  icon: "bg-purple-50 text-purple-600", val: "text-slate-900" },
  }[accentColor] || { border: "border-l-blue-500", icon: "bg-blue-50 text-blue-600", val: "text-slate-900" };

  const displayValue = (() => {
    const num = parseFloat(value);
    if (!isNaN(num)) return `₱${formatCurrency(num)}`;
    return value;
  })();

  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${accent.border} rounded-xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <p className={`text-2xl font-bold truncate ${accent.val}`}>{displayValue}</p>
        {trend !== null && (
          <p className={`text-xs mt-1 ${trend > 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last month
          </p>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Update the stat card grid call sites (around lines 878–923)**

Replace the four `<StatCard ... color="...">` calls:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
  <StatCard
    title="Total Collections"
    value={totalCollections}
    icon={DollarSign}
    accentColor="emerald"
    trend={null}
  />
  <StatCard
    title="Total Expenses"
    value={totalExpenses}
    icon={TrendingDown}
    accentColor="rose"
    trend={null}
  />
  <StatCard
    title="Net Balance"
    value={netBalance}
    icon={netBalance >= 0 ? TrendingUp : TrendingDown}
    accentColor={netBalance >= 0 ? "emerald" : "rose"}
    trend={null}
  />
  <StatCard
    title="Monthly Surplus"
    value={(() => {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyCollections = collections
        .filter(item => { const d = new Date(item.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; })
        .reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
      const monthlyExpenses = expenses
        .filter(item => { const d = new Date(item.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; })
        .reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
      return monthlyCollections - monthlyExpenses;
    })()}
    icon={BarChart3}
    accentColor="purple"
    trend={null}
  />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign stat cards with accent-border style"
```

---

## Task 7: Redesign Status Bar & Charts

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — status bar and chart section

- [ ] **Step 1: Replace the status indicator block (around lines 850–875)**

Find `{/* Status Indicator */}` and replace its content:

```jsx
{/* Status bar */}
<div className="flex items-center gap-4 mb-6 text-xs text-slate-500">
  <div className="flex items-center gap-1.5">
    {backendStatus === "connected"
      ? <div className="w-2 h-2 bg-emerald-500 rounded-full" />
      : <div className="w-2 h-2 bg-rose-500 rounded-full" />}
    <span className="font-medium text-slate-700">
      {backendStatus === "connected" ? "Connected" : "Disconnected"}
    </span>
  </div>
  <span className="text-slate-300">·</span>
  <span>{collections.length} collections</span>
  <span className="text-slate-300">·</span>
  <span>{expenses.length} expenses</span>
  {loading && (
    <>
      <span className="text-slate-300">·</span>
      <span className="text-blue-600 flex items-center gap-1">
        <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing…
      </span>
    </>
  )}
</div>
```

- [ ] **Step 2: Replace the Weekly Financial Trends chart block (around lines 927–976)**

```jsx
{/* Weekly Trends */}
<div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
  <div className="flex items-center justify-between mb-5">
    <div>
      <h3 className="text-sm font-semibold text-slate-900">Weekly Financial Trends</h3>
      <p className="text-xs text-slate-500 mt-0.5">Collections vs Expenses over time</p>
    </div>
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <Calendar className="w-3.5 h-3.5" />
      Real-time
    </div>
  </div>
  {weeklyTrends.length > 0 ? (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={weeklyTrends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" />
        <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}K`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
        <Line type="monotone" dataKey="collections" stroke="#059669" strokeWidth={2} dot={false} name="Collections" />
        <Line type="monotone" dataKey="expenses" stroke="#E11D48" strokeWidth={2} dot={false} name="Expenses" />
        <Line type="monotone" dataKey="net" stroke="#2563EB" strokeWidth={2} dot={false} name="Net" strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  ) : (
    <div className="h-48 flex items-center justify-center text-sm text-slate-400">
      No data yet — add financial records to see trends.
    </div>
  )}
</div>
```

- [ ] **Step 3: Replace the two breakdown chart cards (Expense Breakdown + Collection Sources)**

Find `{/* Breakdown Charts */}` and replace the entire grid block:

```jsx
{/* Breakdown Charts */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
  {/* Expense Breakdown */}
  <div className="bg-white border border-slate-200 rounded-xl p-6">
    <h3 className="text-sm font-semibold text-slate-900 mb-1">Expense Breakdown</h3>
    <p className="text-xs text-slate-500 mb-5">{expenseBreakdown.length} categories</p>
    {expenseBreakdown.length > 0 ? (
      <>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={expenseBreakdown}
              cx="50%" cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
            >
              {expenseBreakdown.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, props) => [`₱${formatCurrency(value)} (${props.payload.percentage}%)`, "Amount"]}
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 space-y-2">
          {expenseBreakdown.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                <span className="text-xs text-slate-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{item.percentage}%</span>
                <span className="text-xs font-semibold text-slate-800">₱{formatCurrency(item.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="h-40 flex items-center justify-center text-sm text-slate-400">
        No expense data yet.
      </div>
    )}
  </div>

  {/* Collection Sources */}
  <div className="bg-white border border-slate-200 rounded-xl p-6">
    <h3 className="text-sm font-semibold text-slate-900 mb-1">Collection Sources</h3>
    <p className="text-xs text-slate-500 mb-5">{collectionSources.length} sources</p>
    {collectionSources.length > 0 ? (
      <>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={collectionSources} margin={{ top: 4, right: 0, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="name" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}K`} />
            <Tooltip
              formatter={(value, _name, props) => [`₱${formatCurrency(value)} (${props.payload.percentage}%)`, "Amount"]}
              contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {collectionSources.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 space-y-2">
          {collectionSources.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                <span className="text-xs text-slate-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{item.percentage}%</span>
                <span className="text-xs font-semibold text-slate-800">₱{formatCurrency(item.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="h-40 flex items-center justify-center text-sm text-slate-400">
        No collection data yet.
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 4: Replace the `CustomTooltip` component (around lines 548–562)**

```jsx
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: ₱{formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign dashboard status bar and chart cards"
```

---

## Task 8: Redesign Recent Transactions Section

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — Recent Collections and Recent Expenses blocks

- [ ] **Step 1: Replace the `{/* Recent Transactions */}` grid block (around lines 1155–1232)**

```jsx
{/* Recent Transactions */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
  {/* Recent Collections */}
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Recent Collections</h3>
        <p className="text-xs text-slate-500">{collections.length} total records</p>
      </div>
      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Income</span>
    </div>
    <div className="divide-y divide-slate-50">
      {collections.length > 0 ? collections.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">{item.particular}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.date} · {item.control_number}</p>
          </div>
          <span className="text-sm font-semibold text-emerald-600 ml-4 flex-shrink-0">
            ₱{formatCurrency(item.total_amount)}
          </span>
        </div>
      )) : (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No collections yet. Use Manage Records to add entries.
        </div>
      )}
    </div>
  </div>

  {/* Recent Expenses */}
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Recent Expenses</h3>
        <p className="text-xs text-slate-500">{expenses.length} total records</p>
      </div>
      <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">Expense</span>
    </div>
    <div className="divide-y divide-slate-50">
      {expenses.length > 0 ? expenses.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">{truncateText(item.particular, 40)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.date} · {item.forms_number}</p>
          </div>
          <span className="text-sm font-semibold text-rose-600 ml-4 flex-shrink-0">
            ₱{formatCurrency(item.total_amount)}
          </span>
        </div>
      )) : (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No expenses yet. Use Manage Records to add entries.
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign recent transactions section"
```

---

## Task 9: Redesign Analytics & Reports Views

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — `selectedView === "analytics"` and `selectedView === "reports"` blocks

- [ ] **Step 1: Replace the analytics view block (`{selectedView === "analytics" && (` through its closing `)}`)** 

```jsx
{selectedView === "analytics" && (
  <div className="space-y-5">
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Monthly Comparison</h3>
      <p className="text-xs text-slate-500 mb-5">Stacked area — collections vs expenses</p>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={weeklyTrends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#E11D48" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#E11D48" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}K`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
          <Area type="monotone" dataKey="collections" stroke="#059669" fill="url(#colGrad)" strokeWidth={2} name="Collections" />
          <Area type="monotone" dataKey="expenses" stroke="#E11D48" fill="url(#expGrad)" strokeWidth={2} name="Expenses" />
        </AreaChart>
      </ResponsiveContainer>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash Flow</span>
        </div>
        <p className="text-sm font-semibold text-slate-800">
          {netBalance > 0 ? "Healthy" : "Alert — Deficit"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {netBalance > 0 && totalExpenses > 0
            ? `Collections exceed expenses by ${Math.round((totalCollections / totalExpenses - 1) * 100)}%`
            : "Expenses currently exceed collections"}
        </p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Balance</span>
        </div>
        <p className={`text-sm font-bold ${netBalance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          ₱{formatCurrency(netBalance)}
        </p>
        <p className="text-xs text-slate-400 mt-1">All-time net position</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Records</span>
        </div>
        <p className="text-sm font-semibold text-slate-800">
          {collections.length + expenses.length} total
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {collections.length} collections · {expenses.length} expenses
        </p>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Replace the reports view block (`{selectedView === "reports" && (` through its closing `)}`)** 

```jsx
{selectedView === "reports" && (
  <div className="space-y-5">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Financial Reports</h2>
        <p className="text-xs text-slate-500 mt-0.5">Last updated: {lastUpdated.toLocaleString()}</p>
      </div>
      <button
        onClick={() => setShowGoogleSheetsModal(true)}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Export to Sheets
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[
        { label: "Collections Total", value: totalCollections, count: collections.length, color: "emerald" },
        { label: "Expenses Total", value: totalExpenses, count: expenses.length, color: "rose" },
        { label: "Net Surplus", value: netBalance, count: null, color: netBalance >= 0 ? "emerald" : "rose" },
      ].map(({ label, value, count, color }) => (
        <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
          <p className={`text-2xl font-bold ${color === "emerald" ? "text-emerald-700" : "text-rose-700"}`}>
            ₱{formatCurrency(value)}
          </p>
          {count !== null && (
            <p className="text-xs text-slate-400 mt-1">{count} transactions</p>
          )}
          {count === null && totalExpenses > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {Math.round((totalCollections / totalExpenses) * 100)}% efficiency ratio
            </p>
          )}
        </div>
      ))}
    </div>

    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h4 className="text-sm font-semibold text-slate-800 mb-3">Summary</h4>
      <p className="text-sm text-slate-600 leading-relaxed">
        The church maintains <span className={`font-semibold ${netBalance > 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {netBalance > 0 ? "healthy" : "deficit"}
        </span> finances with {collections.length} collection records and {expenses.length} expense records on file.
      </p>
      <div className="mt-4 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          This report reflects live data. Use <strong>Export to Sheets</strong> to push a snapshot to Google Sheets.
        </p>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign analytics and reports views"
```

---

## Task 10: Redesign Back-Navigation Views (Records Manager, User Management, Google Forms)

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — the three early-return blocks for `showRecordsManager`, `showUserManagement`, `showGoogleForms`

- [ ] **Step 1: Replace all three early-return wrappers with a shared back-navigation shell**

Find the three blocks (approx lines 565–634) and replace them:

```jsx
if (showRecordsManager) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center gap-3">
        <button
          onClick={() => setShowRecordsManager(false)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <span className="text-slate-300">·</span>
        <span className="text-sm font-medium text-slate-800">Financial Records</span>
      </div>
      <div className="flex-1 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <FinancialRecordsManager onDataChange={handleDataChange} />
      </div>
    </div>
  );
}

if (showUserManagement) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center gap-3">
        <button
          onClick={() => setShowUserManagement(false)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <span className="text-slate-300">·</span>
        <span className="text-sm font-medium text-slate-800">User Management</span>
      </div>
      <div className="flex-1 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <UserManagement user={user} />
      </div>
    </div>
  );
}

if (showGoogleForms) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center gap-3">
        <button
          onClick={() => setShowGoogleForms(false)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <span className="text-slate-300">·</span>
        <span className="text-sm font-medium text-slate-800">Google Forms</span>
      </div>
      <div className="flex-1 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <GoogleFormsManager />
      </div>
    </div>
  );
}

if (showCustomFieldsExample) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center gap-3">
        <button
          onClick={() => setShowCustomFieldsExample(false)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <span className="text-slate-300">·</span>
        <span className="text-sm font-medium text-slate-800">Custom Fields Demo</span>
      </div>
      <div className="flex-1 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
        <CustomFieldsExample />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign back-navigation shell for sub-pages"
```

---

## Task 11: Redesign Google Forms Manager

**Files:**
- Modify: `frontend/src/components/Dashboard.js` — `GoogleFormsManager` component (lines 54–180)

- [ ] **Step 1: Replace the entire `GoogleFormsManager` component**

```jsx
const GoogleFormsManager = () => {
  const [copiedForm, setCopiedForm] = useState("");

  const googleForms = [
    {
      title: "Collection Form",
      description: "Record church collections, tithes, offerings, and special funds",
      url: "https://docs.google.com/forms/d/e/1FAIpQLSd1i2QigWXVj-yV_d-HP83gJFVUscFdivGSBIxPShwU9Era5Q/viewform?usp=header",
      accent: "border-l-emerald-500",
      badge: "bg-emerald-50 text-emerald-700",
      badgeLabel: "Income",
    },
    {
      title: "Expense Form",
      description: "Record church expenses, operational funds, and financial disbursements",
      url: "https://docs.google.com/forms/d/e/1FAIpQLSdGuAwkAARryQ1jGZ-BQoKXZH3YMBBwzzrqimxmJECCDIvMRw/viewform?usp=header",
      accent: "border-l-rose-500",
      badge: "bg-rose-50 text-rose-700",
      badgeLabel: "Expense",
    },
  ];

  const copyToClipboard = async (url, title) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedForm(title);
      setTimeout(() => setCopiedForm(""), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Google Forms</h2>
        <p className="text-sm text-slate-500 mt-1">Share these links with church members to collect financial data.</p>
      </div>

      {googleForms.map((form, i) => (
        <div key={i} className={`bg-white border border-slate-200 border-l-4 ${form.accent} rounded-xl p-5`}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-slate-900">{form.title}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${form.badge}`}>{form.badgeLabel}</span>
              </div>
              <p className="text-xs text-slate-500">{form.description}</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
            <code className="text-xs text-blue-600 flex-1 truncate">{form.url}</code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(form.url, form.title)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition flex-1 justify-center"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedForm === form.title ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => window.open(form.url, "_blank")}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3.5 py-2 rounded-lg transition flex-1 justify-center"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Form
            </button>
          </div>
        </div>
      ))}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-700 mb-3">How to share</p>
        <ul className="space-y-2">
          {[
            "Copy the appropriate form link above",
            "Share via email, WhatsApp, or messaging platforms with authorized members",
            "Submissions will automatically appear in Financial Records",
            "Only users with registered email addresses can submit forms",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 font-semibold flex-shrink-0 flex items-center justify-center text-[10px] mt-0.5">{i + 1}</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "style: redesign Google Forms manager component"
```

---

## Task 12: Redesign Financial Records Manager

**Files:**
- Modify: `frontend/src/components/FinancialRecordsManagerNew.js`

The component is large (500+ lines). This task targets the structural chrome: tab bar, toolbar, table rows, and notification toast. The form fields inside (collection/expense forms) use the same input style described below — apply it consistently to all `<input>`, `<select>`, `<textarea>` elements in the file.

**Input/label base style to apply throughout:**
- Label: `block text-xs font-medium text-slate-500 mb-1`
- Input: `w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`
- Select: same as input

- [ ] **Step 1: Replace the notification toast JSX**

Find the notification block (look for `{notification && (`) and replace:

```jsx
{notification && (
  <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in
    ${notification.type === "success"
      ? "bg-emerald-600 text-white"
      : "bg-rose-600 text-white"}`}
  >
    {notification.type === "success"
      ? <CheckCircle className="w-4 h-4" />
      : <AlertCircle className="w-4 h-4" />}
    {notification.message}
  </div>
)}
```

- [ ] **Step 2: Replace the tab bar**

Find the tab bar section (look for `activeTab === "collections"` class toggle on buttons) and replace:

```jsx
<div className="border-b border-slate-200 mb-6">
  <div className="flex items-center justify-between mb-0">
    <div className="flex">
      {["collections", "expenses"].map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition capitalize
            ${activeTab === tab
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}
        >
          {tab}
        </button>
      ))}
    </div>
    <button
      onClick={() => setShowAddForm(true)}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition mb-1"
    >
      <Plus className="w-4 h-4" />
      Add {activeTab === "collections" ? "Collection" : "Expense"}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Replace the search/filter toolbar**

Find the search + filter bar (look for the `Search` icon input near a `filterDate` input) and replace:

```jsx
<div className="flex flex-col sm:flex-row gap-3 mb-5">
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    <input
      type="text"
      placeholder="Search records…"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
    />
  </div>
  <input
    type="date"
    value={filterDate}
    onChange={(e) => setFilterDate(e.target.value)}
    className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
  />
  {(searchTerm || filterDate) && (
    <button
      onClick={() => { setSearchTerm(""); setFilterDate(""); }}
      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-2 border border-slate-200 rounded-lg transition"
    >
      <X className="w-4 h-4" />
      Clear
    </button>
  )}
</div>
```

- [ ] **Step 4: Replace the records table (the `<table>` element and its rows)**

Find the `<table` element and replace the entire table with:

```jsx
<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reference</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Particular</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filteredRecords.length > 0 ? filteredRecords.map((record, i) => (
          <tr key={i} className="hover:bg-slate-50 transition">
            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{record.date}</td>
            <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
              {activeTab === "collections" ? record.control_number : record.forms_number}
            </td>
            <td className="px-4 py-3 text-slate-800 max-w-[200px] truncate">{record.particular}</td>
            <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap
              ${activeTab === "collections" ? "text-emerald-600" : "text-rose-600"}`}>
              ₱{formatCurrency(record.total_amount)}
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleEdit(record)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(record)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        )) : (
          <tr>
            <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
              {searchTerm || filterDate ? "No records match your filters." : "No records yet. Add your first entry."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>
```

Note: `filteredRecords`, `handleEdit`, `handleDelete` must match the variable names already used in the existing component. Check the existing code for the exact names before applying this step.

- [ ] **Step 5: Apply input/label style to all form fields in the add/edit form modal**

Find the form modal (look for `showAddForm &&` or a `<form>`) and update every `<label>` to `className="block text-xs font-medium text-slate-500 mb-1"` and every `<input>`/`<select>`/`<textarea>` to the base style from the task header above. Also update the modal wrapper:

```jsx
<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
      <h2 className="text-sm font-semibold text-slate-900">
        {editingRecord ? "Edit Record" : `Add ${activeTab === "collections" ? "Collection" : "Expense"}`}
      </h2>
      <button onClick={() => { setShowAddForm(false); setEditingRecord(null); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="p-6">
      {/* existing form fields here — only class names change */}
    </div>
    <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
      <button
        type="button"
        onClick={() => { setShowAddForm(false); setEditingRecord(null); }}
        className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
      >
        <Save className="w-4 h-4" />
        {editingRecord ? "Save Changes" : "Add Record"}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FinancialRecordsManagerNew.js
git commit -m "style: redesign financial records manager UI"
```

---

## Task 13: Redesign User Management

**Files:**
- Modify: `frontend/src/components/UserManagement.js`

- [ ] **Step 1: Update the notification toast** (same pattern as Task 12 Step 1)

```jsx
{notification && (
  <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in
    ${notification.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}
  >
    {notification.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
    {notification.message}
  </div>
)}
```

- [ ] **Step 2: Update the page header and Add User button**

Find the page title/header block and replace:

```jsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h2 className="text-base font-semibold text-slate-900">User Management</h2>
    <p className="text-xs text-slate-500 mt-0.5">{users.length} registered users</p>
  </div>
  <button
    onClick={handleAddUser}
    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
  >
    <Plus className="w-4 h-4" />
    Add User
  </button>
</div>
```

- [ ] **Step 3: Update the search bar** (same style as Task 12 Step 3, without date filter):

```jsx
<div className="relative mb-5">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
  <input
    type="text"
    placeholder="Search users…"
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
  />
</div>
```

- [ ] **Step 4: Replace the users table**

```jsx
<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filteredUsers.length > 0 ? filteredUsers.map((u, i) => (
          <tr key={i} className="hover:bg-slate-50 transition">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
                ${u.role === "super_admin" ? "bg-purple-50 text-purple-700" :
                  u.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}
              >
                {u.role === "super_admin" ? <Crown className="w-3 h-3" /> :
                  u.role === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                {u.role}
              </span>
            </td>
            <td className="px-4 py-3">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
                ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                {u.is_active ? "Active" : "Inactive"}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleEditUser(u)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteUser(u)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        )) : (
          <tr>
            <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
              No users found.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>
```

Note: `filteredUsers`, `handleEditUser`, `handleDeleteUser` must match the actual variable names in the existing component.

- [ ] **Step 5: Apply the same modal shell and input styles to the add/edit user form**

Modal wrapper same as Task 12 Step 5. Input style:
`className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"`

Label style: `className="block text-xs font-medium text-slate-500 mb-1"`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/UserManagement.js
git commit -m "style: redesign user management UI"
```

---

## Task 14: Redesign Modals (Print Report & Google Sheets)

**Files:**
- Modify: `frontend/src/components/PrintReportModal.js`
- Modify: `frontend/src/components/UpdateGoogleSheetModal.js`

Both modals share the same shell pattern.

**Modal shell pattern:**
```jsx
{isOpen && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">[Modal Title]</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Body */}
      <div className="px-6 py-5 space-y-4">
        {/* form fields */}
      </div>
      {/* Footer */}
      <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
        <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition">
          Cancel
        </button>
        <button onClick={handlePrimaryAction} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
          <Download className="w-4 h-4" />
          Generate Report
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 1: Apply the shell pattern and input styles to `PrintReportModal.js`**

- Replace the outer modal wrapper with the shell pattern above (title: "Print Financial Report", primary button: "Generate Report" with `Download` icon)
- Apply input/label style to all fields (`dateFrom`, `dateTo`, `recordType` select, `reportTitle` input)
- Keep all existing state and logic (`reportOptions`, `generatePreview`, `handlePrint`) unchanged

- [ ] **Step 2: Apply the shell pattern and input styles to `UpdateGoogleSheetModal.js`**

- Title: "Export to Google Sheets", primary button: "Export" with `Upload` icon
- Apply same input/label styles
- Keep all existing state and logic unchanged

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PrintReportModal.js frontend/src/components/UpdateGoogleSheetModal.js
git commit -m "style: redesign print report and google sheets modals"
```

---

## Task 15: Final Review & Verification

**Files:** (read-only review pass)

- [ ] **Step 1: Start the dev server and verify the app compiles**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/frontend && npm start
```

Expected: "Compiled successfully" with no errors.

- [ ] **Step 2: Manual browser checklist**

Open `http://localhost:3000` and verify each item:

- [ ] Login page shows split panel on desktop, single column on mobile
- [ ] Sidebar is dark navy, fully visible on desktop (no mobile open required)
- [ ] Hamburger menu opens sidebar on mobile, overlay closes it
- [ ] Stat cards have left border accent, no gradients
- [ ] Charts render with clean grid lines and correct colors
- [ ] Recent Collections show emerald amounts, Recent Expenses show rose amounts
- [ ] Analytics view renders area chart and three health cards
- [ ] Reports view renders summary cards and export button
- [ ] "Manage Records" navigates with a top breadcrumb bar and back button
- [ ] "User Management" navigates with breadcrumb bar
- [ ] Forms open as modals with clean header/footer chrome
- [ ] Page is fully functional — data loads, add/edit/delete still works

- [ ] **Step 3: Fix any compile errors or layout regressions found above**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style: final UI polish and review fixes"
```

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feature/ui-redesign
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Modern minimalist design → Design tokens, Inter font, no gradients, clean borders
- [x] Financial management aesthetic → Emerald/rose color coding for income/expense, stat card accent bars
- [x] Responsive → Hamburger sidebar on mobile, responsive grids at `sm:` / `lg:` breakpoints
- [x] All components covered → Login, Dashboard (all 3 views), Records Manager, User Management, both Modals, Google Forms manager, back-navigation shells

**Placeholder scan:** No TBDs. All JSX blocks are complete. Variable name caveats noted in Tasks 12 & 13 direct the implementer to verify names before applying.

**Type consistency:** `StatCard` uses `accentColor` prop throughout. `formatCurrency` is used consistently from the Dashboard's existing utility. All component prop signatures are unchanged (`onDataChange`, `user`, `onLogout`, `isOpen`, `onClose`).
