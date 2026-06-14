import React, { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart3,
  BarChart2,
  Calendar,
  Printer,
  Search,
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  Database,
  UserCog,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import apiService from "../utils/api";
import FinancialRecordsManager from "./FinancialRecordsManagerNew";
import UserManagement from "./UserManagement";
import PrintReportModal from "./PrintReportModal";
import ReportsView from "./ReportsView";
import CustomFieldsManager from "./CustomFieldsManager";
import CustomFieldsExample from "./CustomFieldsExample";

const Dashboard = ({ user, onLogout }) => {
  const [backendStatus, setBackendStatus] = useState("connected");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState("overview");
  const [showRecordsManager, setShowRecordsManager] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showCustomFieldsExample, setShowCustomFieldsExample] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [customFieldsTable, setCustomFieldsTable] = useState('collections');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "true"; } catch { return false; }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const tooltipRef = useRef(null);

  const showTooltip = (e, label) => {
    if (!sidebarCollapsed) return;
    const el = tooltipRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.style.display = "block";
    el.querySelector("span").textContent = label;
  };

  const hideTooltip = () => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  };

  const toggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("sidebarCollapsed", next.toString()); } catch {}
      return next;
    });
  };

  // Clear all sub-views (management pages)
  const clearSubViews = () => {
    setShowRecordsManager(false);
    setShowUserManagement(false);
    setShowCustomFieldsExample(false);
    setShowCustomFields(false);
  };

  const isSubView = showRecordsManager || showUserManagement || showCustomFieldsExample || showCustomFields;

  const getPageTitle = () => {
    if (showRecordsManager) return "Financial Records";
    if (showUserManagement) return "User Management";
    if (showCustomFields) return "Mobile Form Fields";
    if (showCustomFieldsExample) return "Custom Fields Demo";
    return { overview: "Dashboard", analytics: "Analytics", reports: "Reports" }[selectedView] || "Dashboard";
  };

  const formatCurrency = (value) => {
    const numValue = parseFloat(value) || 0;
    return numValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  useEffect(() => {
    checkBackend();
    loadData();
  }, []);

  const checkBackend = async () => {
    try {
      await apiService.healthCheck();
      setBackendStatus("connected");
    } catch {
      setBackendStatus("disconnected");
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [collectionsData, expensesData] = await Promise.all([
        apiService.getCollections(),
        apiService.getExpenses(),
      ]);
      setCollections(collectionsData);
      setExpenses(expensesData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = () => { loadData(); };
  const handlePrint = () => { setShowPrintModal(true); };

  const totalCollections = collections.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const netBalance = totalCollections - totalExpenses;

  const processWeeklyTrends = () => {
    const weeks = {};
    collections.forEach((item) => {
      const weekKey = `W${Math.ceil(new Date(item.date).getDate() / 7)}`;
      if (!weeks[weekKey]) weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      weeks[weekKey].collections += parseFloat(item.total_amount) || 0;
    });
    expenses.forEach((item) => {
      const weekKey = `W${Math.ceil(new Date(item.date).getDate() / 7)}`;
      if (!weeks[weekKey]) weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      weeks[weekKey].expenses += parseFloat(item.total_amount) || 0;
    });
    Object.values(weeks).forEach(w => { w.net = w.collections - w.expenses; });
    if (Object.keys(weeks).length === 0) {
      for (let i = 1; i <= 4; i++) weeks[`Week ${i}`] = { week: `Week ${i}`, collections: 0, expenses: 0, net: 0 };
    }
    return Object.values(weeks).sort((a, b) => parseInt(a.week.replace("W", "")) - parseInt(b.week.replace("W", "")));
  };

  const processExpenseBreakdown = () => {
    const breakdown = {
      "PBCM Share": 0, "Pastoral Workers": 0, "CAP-Churches": 0, "Honorarium": 0,
      "Conference/Seminar": 0, "Fellowship Events": 0, "Anniversary/Christmas": 0,
      "Supplies": 0, "Utilities": 0, "Vehicle Maintenance": 0, "LTO Registration": 0,
      "Transportation & Gas": 0, "Building Maintenance": 0, "ABCCOP National": 0,
      "CBCC Share": 0, "Kabalikat Share": 0, "ABCCOP Community": 0,
    };
    expenses.forEach((e) => {
      breakdown["PBCM Share"] += parseFloat(e.pbcm_share_expense) || 0;
      breakdown["Pastoral Workers"] += parseFloat(e.pastoral_worker_support) || 0;
      breakdown["CAP-Churches"] += parseFloat(e.cap_assistance) || 0;
      breakdown["Honorarium"] += parseFloat(e.honorarium) || 0;
      breakdown["Conference/Seminar"] += parseFloat(e.conference_seminar) || 0;
      breakdown["Fellowship Events"] += parseFloat(e.fellowship_events) || 0;
      breakdown["Anniversary/Christmas"] += parseFloat(e.anniversary_christmas) || 0;
      breakdown["Supplies"] += parseFloat(e.supplies) || 0;
      breakdown["Utilities"] += parseFloat(e.utilities) || 0;
      breakdown["Vehicle Maintenance"] += parseFloat(e.vehicle_maintenance) || 0;
      breakdown["LTO Registration"] += parseFloat(e.lto_registration) || 0;
      breakdown["Transportation & Gas"] += parseFloat(e.transportation_gas) || 0;
      breakdown["Building Maintenance"] += parseFloat(e.building_maintenance) || 0;
      breakdown["ABCCOP National"] += parseFloat(e.abccop_national) || 0;
      breakdown["CBCC Share"] += parseFloat(e.cbcc_share) || 0;
      breakdown["Kabalikat Share"] += parseFloat(e.kabalikat_share) || 0;
      breakdown["ABCCOP Community"] += parseFloat(e.abccop_community) || 0;
    });
    const filtered = Object.entries(breakdown).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
    const TOP = 5;
    let processed = filtered.length <= TOP ? filtered : filtered.slice(0, TOP);
    if (filtered.length > TOP) {
      const others = filtered.slice(TOP).reduce((sum, [, v]) => sum + v, 0);
      if (others > 0) processed.push(["Others", others]);
    }
    const total = processed.reduce((sum, [, v]) => sum + v, 0);
    const colors = ["#6366f1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#6B7280"];
    return processed.map(([name, value], i) => ({ name, value, percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0, fill: colors[i % colors.length] }));
  };

  const processCollectionSources = () => {
    const sources = { "General Tithes & Offering": 0, "Sunday School": 0, "Youth": 0, "Sisterhood San Juan": 0, "Sisterhood Labuin": 0, "Brotherhood": 0, "Bank Interest": 0 };
    collections.forEach((item) => {
      sources["General Tithes & Offering"] += parseFloat(item.general_tithes_offering) || 0;
      sources["Sunday School"] += parseFloat(item.sunday_school) || 0;
      sources["Youth"] += parseFloat(item.youth) || 0;
      sources["Sisterhood San Juan"] += parseFloat(item.sisterhood_san_juan) || 0;
      sources["Sisterhood Labuin"] += parseFloat(item.sisterhood_labuin) || 0;
      sources["Brotherhood"] += parseFloat(item.brotherhood) || 0;
      sources["Bank Interest"] += parseFloat(item.bank_interest) || 0;
    });
    const hasData = Object.values(sources).some(v => v > 0);
    let filtered;
    if (!hasData) {
      const fallback = {};
      collections.forEach(item => { const k = item.particular || "Unknown"; fallback[k] = (fallback[k] || 0) + (item.total_amount || 0); });
      filtered = Object.entries(fallback).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
    } else {
      filtered = Object.entries(sources).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
    }
    const total = filtered.reduce((sum, [, v]) => sum + v, 0);
    const colors = ["#6366f1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#84CC16"];
    return filtered.map(([name, value], i) => ({ name, value, percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0, fill: colors[i % colors.length] }));
  };

  const weeklyTrends = processWeeklyTrends();
  const expenseBreakdown = processExpenseBreakdown();
  const collectionSources = processCollectionSources();

  const getStewardboxInsight = () => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const sumFor = (arr, m, y) =>
      arr.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y; })
         .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

    const currC = sumFor(collections, thisMonth, thisYear);
    const prevC = sumFor(collections, prevMonth, prevYear);

    if (currC > 0 && prevC > 0) {
      const pct = Math.round(((currC - prevC) / prevC) * 100);
      const monthName = new Date(thisYear, prevMonth).toLocaleString('default', { month: 'long' });
      const trend = pct >= 0 ? `up ${pct}%` : `down ${Math.abs(pct)}%`;
      return `Collections are ${trend} from ${monthName}.`;
    }
    return 'View this month\'s full summary →';
  };

  const StatCard = ({ title, value, icon: Icon, accentColor = "blue" }) => {
    const accent = {
      blue:    { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#3d2a08]" },
      emerald: { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#c49030]" },
      rose:    { border: "border-l-[#c04828]",  icon: "bg-[#fff5f0] text-[#c04828]",  val: "text-[#c04828]" },
      purple:  { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#3d2a08]" },
    }[accentColor] || { border: "border-l-[#c49030]", icon: "bg-[#fff8e6] text-[#c49030]", val: "text-[#3d2a08]" };

    const num = parseFloat(value);
    const displayValue = !isNaN(num) ? `₱${formatCurrency(num)}` : value;

    return (
      <div className={`bg-[#fff8e6] border border-[#e8d090] border-l-4 ${accent.border} rounded-xl p-5 flex items-start gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-[#b89048] uppercase tracking-widest mb-1">{title}</p>
          <p className={`text-2xl font-bold truncate tracking-tight ${accent.val}`}>{displayValue}</p>
        </div>
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#fff8e6] border border-[#e8d090] rounded-xl p-3 shadow-lg text-xs">
        <p className="font-semibold text-[#3d2a08] mb-1.5">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center gap-1.5" style={{ color: entry.color }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: entry.color }} />
            {entry.name}: ₱{formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  // Build nav sections — active state accounts for sub-views
  const navSections = [
    {
      label: "Overview",
      items: [
        { id: "overview", label: "Dashboard", icon: LayoutDashboard, imgSrc: '/sb-dashboard.png', onClick: () => { clearSubViews(); setSelectedView("overview"); setSidebarOpen(false); }, active: selectedView === "overview" && !isSubView },
        { id: "analytics", label: "Analytics", icon: BarChart2, onClick: () => { clearSubViews(); setSelectedView("analytics"); setSidebarOpen(false); }, active: selectedView === "analytics" && !isSubView },
        { id: "reports", label: "Reports", icon: BookOpen, imgSrc: '/sb-google-sheet.png', onClick: () => { clearSubViews(); setSelectedView("reports"); setSidebarOpen(false); }, active: selectedView === "reports" && !isSubView },
      ],
    },
    ...(user?.role === "admin" || user?.role === "super_admin" ? [{
      label: "Management",
      items: [
        { id: "records", label: "Manage Records", icon: Database, imgSrc: '/sb-expenses.png', onClick: () => { clearSubViews(); setShowRecordsManager(true); setSidebarOpen(false); }, active: showRecordsManager },
        { id: "users", label: "Users", icon: UserCog, onClick: () => { clearSubViews(); setShowUserManagement(true); setSidebarOpen(false); }, active: showUserManagement },
        { id: "fields", label: "Mobile Form Fields", icon: Settings, onClick: () => { clearSubViews(); setShowCustomFields(true); setSidebarOpen(false); }, active: showCustomFields },
      ],
    }] : []),
    {
      label: "Actions",
      items: [
        { id: "print", label: "Print Report", icon: Printer, onClick: handlePrint, active: false },
      ],
    },
  ];

  const NavItem = ({ item }) => (
    <button
      onClick={item.onClick}
      onMouseEnter={(e) => showTooltip(e, item.label)}
      onMouseLeave={hideTooltip}
      className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150 border
        ${sidebarCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5"}
        ${item.active
          ? "border-[#e8c870] shadow-sm"
          : "border-transparent"}`}
      style={item.active
        ? { background: 'linear-gradient(135deg, #fff8e6, #fdefc0)', color: '#c49030' }
        : { color: '#8a6028' }}
    >
      {item.imgSrc ? (
        <img
          src={item.imgSrc}
          alt=""
          style={{
            flexShrink: 0,
            opacity: item.active ? 1 : 0.4,
            filter: item.active ? 'none' : 'grayscale(0.3)',
            width: sidebarCollapsed ? 20 : 18,
            height: sidebarCollapsed ? 20 : 18,
            objectFit: 'contain',
          }}
        />
      ) : (
        <item.icon className={`flex-shrink-0 ${sidebarCollapsed ? "lg:w-5 lg:h-5 w-4 h-4" : "w-4 h-4"}`} />
      )}
      <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.label}</span>
    </button>
  );

  const Sidebar = () => (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transform transition-all duration-300 ease-out
          lg:relative lg:translate-x-0 lg:flex lg:h-full
          ${sidebarCollapsed ? "lg:w-[68px]" : "lg:w-64"}
          ${sidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full lg:translate-x-0"}`}
        style={{ background: 'linear-gradient(180deg, #fff8e6, #fef3d0)', boxShadow: '1px 0 0 0 #e8d090' }}
      >
        {/* Logo + collapse toggle in one row */}
        <div
          className={`relative h-16 border-b border-[#e8d090] flex-shrink-0 flex items-center gap-2 transition-all duration-300
            ${sidebarCollapsed ? "lg:justify-center lg:px-0" : "justify-between px-4"}`}
        >
          {/* Icon + text — entire block hidden on desktop when collapsed */}
          <div className={`relative flex items-center gap-3 min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <img src="/sb-icon.png" alt="StewardBox" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
            <span className="font-bold text-sm tracking-tight whitespace-nowrap" style={{ color: '#3d2a08' }}>
              StewardBox
            </span>
          </div>
          {/* Buttons */}
          <div className="relative flex items-center flex-shrink-0">
            {/* Desktop collapse toggle — always visible on lg */}
            <button
              onClick={toggleCollapse}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-[#b89048] hover:text-[#8a6028] hover:bg-[#f0e4b0] transition"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            {/* Mobile close */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden flex items-center justify-center w-7 h-7 rounded-lg text-[#b89048] hover:text-[#8a6028] hover:bg-[#f0e4b0] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nav — overflow visible so tooltips can escape when collapsed */}
        <nav className="flex-1 py-3 px-2.5 flex flex-col gap-0.5 overflow-y-auto scrollbar-thin">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? "pt-3" : ""}>
              {!sidebarCollapsed ? (
                <p className="px-3 mb-1.5 text-[10px] font-bold text-[#b89048] uppercase tracking-widest">
                  {section.label}
                </p>
              ) : (
                si > 0 && <div className="h-px mx-2 mb-3" style={{ background: '#e8d090' }} />
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map(item => <NavItem key={item.id} item={item} />)}
              </div>
            </div>
          ))}

          {/* Sign out at the bottom */}
          <div className="pt-3 mt-auto">
            <div className="h-px mx-1 mb-3" style={{ background: '#e8d090' }} />
            <button
              onClick={onLogout}
              onMouseEnter={(e) => showTooltip(e, "Sign Out")}
              onMouseLeave={hideTooltip}
              className={`w-full flex items-center rounded-xl text-sm font-medium text-[#c04828] hover:bg-rose-500/10 hover:text-[#a03820] border border-transparent transition-all duration-150
                ${sidebarCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5"}`}
            >
              <LogOut className={`flex-shrink-0 ${sidebarCollapsed ? "lg:w-5 lg:h-5 w-4 h-4" : "w-4 h-4"}`} />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>Sign Out</span>
            </button>
          </div>
        </nav>

        {/* User footer */}
        <div className={`p-3 border-t border-[#e8d090] flex-shrink-0 flex items-center gap-3 transition-all duration-300 ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: 'linear-gradient(135deg, #d4a843, #c49030)' }}>
            <span className="text-xs font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className={`min-w-0 flex-1 transition-all duration-300 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <p className="text-sm font-semibold text-[#3d2a08] truncate leading-tight">{user.name}</p>
            <p className="text-[11px] text-[#8a6028] capitalize mt-0.5">{user.role}</p>
          </div>
        </div>
      </aside>
    </>
  );

  return (
    // h-screen + overflow-hidden: sidebar stays fixed height, only main content scrolls
    <div className="h-screen bg-[#fef9f0] flex overflow-hidden">
      <Sidebar />

      {/* Collapsed sidebar tooltip — always in DOM, shown/hidden via ref to avoid re-renders */}
      <div
        ref={tooltipRef}
        className="fixed z-[200] pointer-events-none"
        style={{ left: 80, display: "none", transform: "translateY(-50%)" }}
      >
        <span className="block px-2.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap" style={{ background: '#fff8e6', color: '#3d2a08', border: '1px solid #e8d090', boxShadow: '0 4px 14px rgba(180,120,20,0.15)' }} />
      </div>

      {/* Main content — fills remaining width, fixed height */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0" style={{ background: '#fff8e6', borderBottom: '1px solid #e8d090', boxShadow: '0 1px 4px rgba(180,120,20,0.08)' }}>
          <div className="flex items-center justify-between px-4 sm:px-6 h-16 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl text-[#b89048] hover:text-[#8a6028] hover:bg-[#f0e4b0] transition"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-[#3d2a08] leading-tight tracking-tight">{getPageTitle()}</h1>
                <p className="text-xs text-[#b89048] hidden sm:block">
                  Welcome back, <span className="font-medium text-[#8a6028]">{user.name}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#b89048]" />
                <input
                  type="text"
                  className="pl-9 pr-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c49030] focus:border-transparent w-44 transition"
                  style={{ border: '1px solid #e8d090', background: '#fff8e6', color: '#3d2a08' }}
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={loadData}
                disabled={loading}
                title="Refresh data"
                className="p-2 rounded-xl border disabled:opacity-40 transition"
                style={{ border: '1px solid #e8d090', color: '#b89048', background: 'transparent' }}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable content area — only this scrolls */}
        <main className="flex-1 overflow-y-auto">
          {/* Management sub-views — render inside layout, no full-screen takeover */}
          {showRecordsManager && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-end gap-3 mb-5">
                <img src="/sb-expenses.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
                <div className="flex-1 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fef3d0)', border: '1.5px solid #e8d090', borderRadius: '14px 14px 14px 4px' }}>
                  <p className="text-xs font-bold" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                  <p className="text-xs mt-1" style={{ color: '#3d2a08', lineHeight: 1.4 }}>Add, edit, or remove financial records here. All changes sync automatically to the database.</p>
                </div>
              </div>
              <FinancialRecordsManager onDataChange={handleDataChange} />
            </div>
          )}
          {showUserManagement && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <UserManagement user={user} />
            </div>
          )}
          {showCustomFieldsExample && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <CustomFieldsExample />
            </div>
          )}
          {showCustomFields && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <div className="mb-4 flex gap-2">
                {['collections', 'expenses'].map(t => (
                  <button
                    key={t}
                    onClick={() => setCustomFieldsTable(t)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition`}
                    style={customFieldsTable === t
                      ? { background: 'linear-gradient(135deg, #d4a843, #c49030)', color: '#fff' }
                      : { background: '#fff8e6', color: '#8a6028', border: '1px solid #e8d090' }}
                  >
                    {t === 'collections' ? 'Collection Fields' : 'Expense Fields'}
                  </button>
                ))}
              </div>
              <CustomFieldsManager tableName={customFieldsTable} />
            </div>
          )}

          {/* Dashboard views */}
          {!isSubView && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
              {/* Status bar */}
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${backendStatus === "connected" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${backendStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {backendStatus === "connected" ? "Connected" : "Disconnected"}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="px-2.5 py-1 bg-[#fff8e6] rounded-full font-medium text-[#8a6028]">{collections.length} collections</span>
                  <span className="px-2.5 py-1 bg-[#fff8e6] rounded-full font-medium text-[#8a6028]">{expenses.length} expenses</span>
                  {loading && (
                    <span className="flex items-center gap-1.5 text-[#c49030] font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing…
                    </span>
                  )}
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <StatCard title="Total Collections" value={totalCollections} icon={DollarSign} accentColor="emerald" />
                <StatCard title="Total Expenses" value={totalExpenses} icon={TrendingDown} accentColor="rose" />
                <StatCard title="Net Balance" value={netBalance} icon={netBalance >= 0 ? TrendingUp : TrendingDown} accentColor={netBalance >= 0 ? "emerald" : "rose"} />
                <StatCard
                  title="Monthly Surplus"
                  value={(() => {
                    const m = new Date().getMonth(), y = new Date().getFullYear();
                    const mc = collections.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y; }).reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
                    const me = expenses.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y; }).reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
                    return mc - me;
                  })()}
                  icon={BarChart3}
                  accentColor="purple"
                />
              </div>

              {selectedView === "overview" && (
                <>
                  <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl p-6 mb-5 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-sm font-bold text-[#3d2a08]">Weekly Financial Trends</h3>
                        <p className="text-xs text-[#b89048] mt-0.5">Collections vs Expenses over time</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[#b89048] bg-[#fff8e6] border border-[#e8d090] px-2.5 py-1 rounded-lg">
                        <Calendar className="w-3.5 h-3.5" />
                        Real-time
                      </div>
                    </div>
                    {weeklyTrends.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={weeklyTrends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" />
                          <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}K`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                          <Line type="monotone" dataKey="collections" stroke="#c49030" strokeWidth={2.5} dot={false} name="Collections" />
                          <Line type="monotone" dataKey="expenses" stroke="#c04828" strokeWidth={2.5} dot={false} name="Expenses" />
                          <Line type="monotone" dataKey="net" stroke="#8a6028" strokeWidth={2} dot={false} name="Net" strokeDasharray="5 3" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-sm text-slate-400">No data yet — add financial records to see trends.</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                    <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-[#3d2a08] mb-0.5">Expense Breakdown</h3>
                      <p className="text-xs text-[#b89048] mb-5">{expenseBreakdown.length} categories</p>
                      {expenseBreakdown.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie data={expenseBreakdown} cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={2} dataKey="value" labelLine={false}>
                                {expenseBreakdown.map((e, i) => <Cell key={i} fill={e.fill} />)}
                              </Pie>
                              <Tooltip formatter={(v, _n, p) => [`₱${formatCurrency(v)} (${p.payload.percentage}%)`, "Amount"]} contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: "12px", fontFamily: "inherit" }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="mt-4 space-y-2">
                            {expenseBreakdown.map((item, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} /><span className="text-xs text-slate-600">{item.name}</span></div>
                                <div className="flex items-center gap-3"><span className="text-xs text-slate-400">{item.percentage}%</span><span className="text-xs font-bold text-slate-700">₱{formatCurrency(item.value)}</span></div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : <div className="h-40 flex items-center justify-center text-sm text-slate-400">No expense data yet.</div>}
                    </div>

                    <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-[#3d2a08] mb-0.5">Collection Sources</h3>
                      <p className="text-xs text-[#b89048] mb-5">{collectionSources.length} sources</p>
                      {collectionSources.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={collectionSources} margin={{ top: 4, right: 0, left: 0, bottom: 48 }}>
                              <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" vertical={false} />
                              <XAxis dataKey="name" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}K`} />
                              <Tooltip formatter={(v, _n, p) => [`₱${formatCurrency(v)} (${p.payload.percentage}%)`, "Amount"]} contentStyle={{ backgroundColor: "#fff", border: "1px solid #E2E8F0", borderRadius: "12px", fontSize: "12px", fontFamily: "inherit" }} />
                              <Bar dataKey="value" radius={[5, 5, 0, 0]}>{collectionSources.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <div className="mt-4 space-y-2">
                            {collectionSources.map((item, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} /><span className="text-xs text-slate-600">{item.name}</span></div>
                                <div className="flex items-center gap-3"><span className="text-xs text-slate-400">{item.percentage}%</span><span className="text-xs font-bold text-slate-700">₱{formatCurrency(item.value)}</span></div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : <div className="h-40 flex items-center justify-center text-sm text-slate-400">No collection data yet.</div>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-5 py-4 border-b border-[#f0e4b0] flex items-center justify-between">
                        <div><h3 className="text-sm font-bold text-[#3d2a08]">Recent Collections</h3><p className="text-xs text-[#b89048]">{collections.length} total records</p></div>
                        <span className="text-xs font-semibold text-[#c49030] bg-[#fff8e6] border border-[#e8d090] px-2.5 py-1 rounded-full">Income</span>
                      </div>
                      <div className="divide-y divide-[#f0e4b0]">
                        {collections.length > 0 ? collections.slice(0, 5).map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#fef3d0]/80 transition">
                            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#3d2a08] truncate">{item.particular}</p><p className="text-xs text-[#b89048] mt-0.5">{item.date} · {item.control_number}</p></div>
                            <span className="text-sm font-bold text-[#c49030] ml-4 flex-shrink-0">₱{formatCurrency(item.total_amount)}</span>
                          </div>
                        )) : <div className="px-5 py-10 text-center text-sm text-[#b89048]">No collections yet. Use Manage Records to add entries.</div>}
                      </div>
                    </div>

                    <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-5 py-4 border-b border-[#f0e4b0] flex items-center justify-between">
                        <div><h3 className="text-sm font-bold text-[#3d2a08]">Recent Expenses</h3><p className="text-xs text-[#b89048]">{expenses.length} total records</p></div>
                        <span className="text-xs font-semibold text-[#c04828] bg-[#fff5f0] border border-[#f0c0b0] px-2.5 py-1 rounded-full">Expense</span>
                      </div>
                      <div className="divide-y divide-[#f0e4b0]">
                        {expenses.length > 0 ? expenses.slice(0, 5).map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#fef3d0]/80 transition">
                            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#3d2a08] truncate">{truncateText(item.particular, 40)}</p><p className="text-xs text-[#b89048] mt-0.5">{item.date} · {item.forms_number}</p></div>
                            <span className="text-sm font-bold text-[#c04828] ml-4 flex-shrink-0">₱{formatCurrency(item.total_amount)}</span>
                          </div>
                        )) : <div className="px-5 py-10 text-center text-sm text-[#b89048]">No expenses yet. Use Manage Records to add entries.</div>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-end gap-3">
                    <img src="/sb-dashboard.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
                    <div className="flex-1 flex items-center gap-4 p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fdefc0)', border: '1px solid #e8c870', borderRadius: '14px 14px 14px 4px' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                        <p className="text-xs mt-1" style={{ color: '#3d2a08', lineHeight: 1.4 }}>{getStewardboxInsight()}</p>
                      </div>
                      <button
                        onClick={() => { clearSubViews(); setSelectedView("reports"); }}
                        className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, #d4a843, #c49030)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,144,48,0.3)' }}
                      >
                        Export →
                      </button>
                    </div>
                  </div>
                </>
              )}

              {selectedView === "analytics" && (
                <div className="space-y-5">
                  <div className="flex items-end gap-3">
                    <img src="/sb-dashboard.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
                    <div className="flex-1 p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fef3d0)', border: '1.5px solid #e8d090', borderRadius: '14px 14px 14px 4px' }}>
                      <p className="text-xs font-bold" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                      <p className="text-xs mt-1" style={{ color: '#3d2a08', lineHeight: 1.4 }}>Dive into the numbers! Analyze monthly trends and track your cash flow performance over time.</p>
                    </div>
                  </div>
                  <div className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-[#3d2a08] mb-0.5">Monthly Comparison</h3>
                    <p className="text-xs text-[#b89048] mb-5">Stacked area — collections vs expenses</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={weeklyTrends} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c49030" stopOpacity={0.15} /><stop offset="95%" stopColor="#c49030" stopOpacity={0} /></linearGradient>
                          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c04828" stopOpacity={0.15} /><stop offset="95%" stopColor="#c04828" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="#F1F5F9" />
                        <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}K`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                        <Area type="monotone" dataKey="collections" stroke="#c49030" fill="url(#colGrad)" strokeWidth={2.5} name="Collections" />
                        <Area type="monotone" dataKey="expenses" stroke="#c04828" fill="url(#expGrad)" strokeWidth={2.5} name="Expenses" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { dot: "bg-emerald-500", label: "Cash Flow", title: netBalance > 0 ? "Healthy" : "Alert — Deficit", desc: netBalance > 0 && totalExpenses > 0 ? `Collections exceed expenses by ${Math.round((totalCollections / totalExpenses - 1) * 100)}%` : "Expenses currently exceed collections" },
                      { dot: "bg-[#c49030]", label: "Net Balance", title: `₱${formatCurrency(netBalance)}`, titleColor: netBalance >= 0 ? "text-[#c49030]" : "text-[#c04828]", desc: "All-time net position" },
                      { dot: "bg-violet-500", label: "Records", title: `${collections.length + expenses.length} total`, desc: `${collections.length} collections · ${expenses.length} expenses` },
                    ].map((card, i) => (
                      <div key={i} className="bg-[#fff8e6] border border-[#e8d090] rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                        <div className="flex items-center gap-2 mb-2"><div className={`w-2 h-2 rounded-full ${card.dot}`} /><span className="text-[10px] font-bold text-[#b89048] uppercase tracking-widest">{card.label}</span></div>
                        <p className={`text-sm font-bold mb-1 ${card.titleColor || "text-[#3d2a08]"}`}>{card.title}</p>
                        <p className="text-xs text-[#b89048]">{card.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedView === "reports" && (
                <>
                <div className="flex items-end gap-3 mb-5">
                  <img src="/sb-google-sheet.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
                  <div className="flex-1 p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fef3d0)', border: '1.5px solid #e8d090', borderRadius: '14px 14px 14px 4px' }}>
                    <p className="text-xs font-bold" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                    <p className="text-xs mt-1" style={{ color: '#3d2a08', lineHeight: 1.4 }}>Generate and export your financial reports. Sync to Google Sheets or print a summary for your records.</p>
                  </div>
                </div>
                <ReportsView
                  user={user}
                  collections={collections}
                  expenses={expenses}
                  lastUpdated={lastUpdated}
                  formatCurrency={formatCurrency}
                />
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <PrintReportModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} user={user} />
    </div>
  );
};

export default Dashboard;
