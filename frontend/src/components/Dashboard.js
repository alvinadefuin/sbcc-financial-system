import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart3,
  Calendar,
  Plus,
  ArrowLeft,
  Users,
  Shield,
  Printer,
  Search,
  Home,
  Activity,
  Power,
  Menu,
  X,
  FileText,
  Copy,
  ExternalLink,
  FileSpreadsheet,
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
import UpdateGoogleSheetModal from "./UpdateGoogleSheetModal";
import CustomFieldsManager from "./CustomFieldsManager";
import CustomFieldsExample from "./CustomFieldsExample";

// Google Forms Manager Component - Moved outside Dashboard to avoid scope issues
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

const Dashboard = ({ user, onLogout }) => {
  const [backendStatus, setBackendStatus] = useState("connected");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState("overview");
  const [showRecordsManager, setShowRecordsManager] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showGoogleForms, setShowGoogleForms] = useState(false);
  const [showCustomFieldsManager, setShowCustomFieldsManager] = useState(false);
  const [showCustomFieldsExample, setShowCustomFieldsExample] = useState(false);
  const [customFieldsTableName, setCustomFieldsTableName] = useState("collections");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState(false);

  // Currency formatting utility
  const formatCurrency = (value) => {
    const numValue = parseFloat(value) || 0;
    return numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Text truncation utility
  const truncateText = (text, maxLength = 50) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

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
    setLoading(true);
    try {
      const [collectionsData, expensesData] = await Promise.all([
        apiService.getCollections(),
        apiService.getExpenses(),
      ]);
      setCollections(collectionsData);
      setExpenses(expensesData);
      setLastUpdated(new Date());
      console.log("Dashboard data refreshed:", {
        collections: collectionsData.length,
        expenses: expensesData.length,
      });
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Callback function to refresh data when CRUD operations happen
  const handleDataChange = () => {
    console.log("Data change detected, refreshing dashboard...");
    loadData();
  };

  // Open print report modal
  const handlePrint = () => {
    setShowPrintModal(true);
  };

  // Calculate totals
  const totalCollections = collections.reduce(
    (sum, item) => sum + (parseFloat(item.total_amount) || 0),
    0
  );
  const totalExpenses = expenses.reduce(
    (sum, item) => sum + (parseFloat(item.total_amount) || 0),
    0
  );
  const netBalance = totalCollections - totalExpenses;

  // Debug logging
  console.log('Balance Debug:', {
    totalCollections,
    totalExpenses,
    netBalance,
    collectionsLength: collections.length,
    expensesLength: expenses.length
  });

  // Process data for charts - with real-time updates
  const processWeeklyTrends = () => {
    const weeks = {};

    // Debug logging
    console.log('processWeeklyTrends - Collections:', collections.length, 'Expenses:', expenses.length);

    if (collections.length > 0) {
      console.log('Sample collection date:', collections[0].date, 'Parsed:', new Date(collections[0].date));
    }

    // Process ALL data to see if that works
    collections.forEach((item) => {
      const date = new Date(item.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `W${weekNum}`;

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      }
      weeks[weekKey].collections += parseFloat(item.total_amount) || 0;
    });

    expenses.forEach((item) => {
      const date = new Date(item.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `W${weekNum}`;

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      }
      weeks[weekKey].expenses += parseFloat(item.total_amount) || 0;
    });

    // Calculate net for each week
    Object.values(weeks).forEach((week) => {
      week.net = week.collections - week.expenses;
    });

    // If no data, show placeholder weeks
    if (Object.keys(weeks).length === 0) {
      console.log('No weekly data found, adding placeholder weeks');
      for (let i = 1; i <= 4; i++) {
        weeks[`Week ${i}`] = { week: `Week ${i}`, collections: 0, expenses: 0, net: 0 };
      }
    }

    const result = Object.values(weeks).sort(
      (a, b) => {
        const aNum = parseInt(a.week.replace('W', ''));
        const bNum = parseInt(b.week.replace('W', ''));
        return aNum - bNum;
      }
    );

    console.log('Weekly trends final data:', result);
    return result;
  };

  const processExpenseBreakdown = () => {
    const breakdown = {
      "PBCM Share": 0,
      "Pastoral Workers": 0,
      "CAP-Churches": 0,
      "Honorarium": 0,
      "Conference/Seminar": 0,
      "Fellowship Events": 0,
      "Anniversary/Christmas": 0,
      "Supplies": 0,
      "Utilities": 0,
      "Vehicle Maintenance": 0,
      "LTO Registration": 0,
      "Transportation & Gas": 0,
      "Building Maintenance": 0,
      "ABCCOP National": 0,
      "CBCC Share": 0,
      "Kabalikat Share": 0,
      "ABCCOP Community": 0,
    };

    expenses.forEach((expense) => {
      breakdown["PBCM Share"] += parseFloat(expense.pbcm_share_expense) || 0;
      breakdown["Pastoral Workers"] += parseFloat(expense.pastoral_worker_support) || 0;
      breakdown["CAP-Churches"] += parseFloat(expense.cap_assistance) || 0;
      breakdown["Honorarium"] += parseFloat(expense.honorarium) || 0;
      breakdown["Conference/Seminar"] += parseFloat(expense.conference_seminar) || 0;
      breakdown["Fellowship Events"] += parseFloat(expense.fellowship_events) || 0;
      breakdown["Anniversary/Christmas"] += parseFloat(expense.anniversary_christmas) || 0;
      breakdown["Supplies"] += parseFloat(expense.supplies) || 0;
      breakdown["Utilities"] += parseFloat(expense.utilities) || 0;
      breakdown["Vehicle Maintenance"] += parseFloat(expense.vehicle_maintenance) || 0;
      breakdown["LTO Registration"] += parseFloat(expense.lto_registration) || 0;
      breakdown["Transportation & Gas"] += parseFloat(expense.transportation_gas) || 0;
      breakdown["Building Maintenance"] += parseFloat(expense.building_maintenance) || 0;
      breakdown["ABCCOP National"] += parseFloat(expense.abccop_national) || 0;
      breakdown["CBCC Share"] += parseFloat(expense.cbcc_share) || 0;
      breakdown["Kabalikat Share"] += parseFloat(expense.kabalikat_share) || 0;
      breakdown["ABCCOP Community"] += parseFloat(expense.abccop_community) || 0;
    });

    // Filter out zero values and sort by amount (highest first)
    const filteredBreakdown = Object.entries(breakdown)
      .filter(([_, value]) => value > 0)
      .sort(([,a], [,b]) => b - a);

    // Take top 5 categories and group the rest as "Others"
    const TOP_CATEGORIES = 5;
    let processedData = [];
    let othersTotal = 0;

    if (filteredBreakdown.length <= TOP_CATEGORIES) {
      processedData = filteredBreakdown;
    } else {
      processedData = filteredBreakdown.slice(0, TOP_CATEGORIES);
      othersTotal = filteredBreakdown
        .slice(TOP_CATEGORIES)
        .reduce((sum, [_, value]) => sum + value, 0);

      if (othersTotal > 0) {
        processedData.push(["Others", othersTotal]);
      }
    }

    // Calculate total for percentages
    const total = processedData.reduce((sum, [_, value]) => sum + value, 0);

    // Professional color palette
    const colors = [
      "#3B82F6", // Blue
      "#10B981", // Emerald
      "#F59E0B", // Amber
      "#EF4444", // Red
      "#8B5CF6", // Violet
      "#6B7280", // Gray (for Others)
    ];

    return processedData.map(([name, value], index) => ({
      name,
      value,
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0,
      fill: colors[index % colors.length],
    }));
  };

  const processCollectionSources = () => {
    const sources = {
      "General Tithes & Offering": 0,
      "Sunday School": 0,
      "Youth": 0,
      "Sisterhood San Juan": 0,
      "Sisterhood Labuin": 0,
      "Brotherhood": 0,
      "Bank Interest": 0,
    };

    collections.forEach((item) => {
      sources["General Tithes & Offering"] += parseFloat(item.general_tithes_offering) || 0;
      sources["Sunday School"] += parseFloat(item.sunday_school) || 0;
      sources["Youth"] += parseFloat(item.youth) || 0;
      sources["Sisterhood San Juan"] += parseFloat(item.sisterhood_san_juan) || 0;
      sources["Sisterhood Labuin"] += parseFloat(item.sisterhood_labuin) || 0;
      sources["Brotherhood"] += parseFloat(item.brotherhood) || 0;
      sources["Bank Interest"] += parseFloat(item.bank_interest) || 0;
    });

    // Check if we have any detailed breakdown data
    const hasDetailedData = Object.values(sources).some(value => value > 0);

    // Debug logging to see what data we're getting
    console.log('Collection Sources Debug:', {
      collectionsCount: collections.length,
      sources,
      hasDetailedData,
      sampleCollection: collections[0]
    });

    let filteredSources;

    if (!hasDetailedData) {
      // Fallback: Use particular field to group collections when detailed breakdown is missing
      const fallbackSources = {};

      collections.forEach((item) => {
        const description = item.particular || "Unknown Source";
        if (!fallbackSources[description]) {
          fallbackSources[description] = 0;
        }
        fallbackSources[description] += item.total_amount || 0;
      });

      filteredSources = Object.entries(fallbackSources)
        .filter(([_, value]) => value > 0)
        .sort(([,a], [,b]) => b - a);
    } else {
      // Use detailed breakdown data
      filteredSources = Object.entries(sources)
        .filter(([_, value]) => value > 0)
        .sort(([,a], [,b]) => b - a);
    }

    const total = filteredSources.reduce((sum, [_, value]) => sum + value, 0);

    // Professional color palette for collections
    const colors = [
      "#3B82F6", // Blue
      "#10B981", // Emerald
      "#F59E0B", // Amber
      "#EF4444", // Red
      "#8B5CF6", // Violet
      "#EC4899", // Pink
      "#14B8A6", // Teal
      "#F97316", // Orange
      "#84CC16", // Lime
    ];

    return filteredSources.map(([name, value], index) => ({
      name,
      value,
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0,
      fill: colors[index % colors.length],
    }));
  };

  // Recalculate chart data when collections/expenses change
  const weeklyTrends = processWeeklyTrends();
  const expenseBreakdown = processExpenseBreakdown();
  const collectionSources = processCollectionSources();

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

  // If showing records manager, render it with callbacks
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

  // If showing user management, render it
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

  // If showing Google Forms, render it
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

  // If showing Custom Fields Example, render it
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

  // Sidebar component
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

            {/* Key Metrics Cards */}
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

        {selectedView === "overview" && (
          <>
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
          </>
        )}

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
        </div>
      </main>
    </div>

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
};

export default Dashboard;
