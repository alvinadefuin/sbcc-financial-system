import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle,
  XCircle,
  BarChart3,
  Calendar,
  Download,
  Plus,
  ArrowLeft,
  Users,
  Shield,
  Printer,
  Search,
  Home,
  PieChart as PieChartIcon,
  Activity,
  Power,
  Menu,
  X,
  FileText,
  Copy,
  ExternalLink,
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

// Google Forms Manager Component - Moved outside Dashboard to avoid scope issues
const GoogleFormsManager = () => {
  const [copiedForm, setCopiedForm] = useState("");

  const googleForms = [
    {
      title: "Collection Form",
      description: "For recording church collections, tithes, offerings, and special funds",
      url: "https://docs.google.com/forms/d/e/1FAIpQLSd1i2QigWXVj-yV_d-HP83gJFVUscFdivGSBIxPShwU9Era5Q/viewform?usp=header",
      color: "bg-green-50 border-green-200",
      iconColor: "text-green-600"
    },
    {
      title: "Expense Form", 
      description: "For recording church expenses, operational funds, and financial disbursements",
      url: "https://docs.google.com/forms/d/e/1FAIpQLSdGuAwkAARryQ1jGZ-BQoKXZH3YMBBwzzrqimxmJECCDIvMRw/viewform?usp=header",
      color: "bg-red-50 border-red-200",
      iconColor: "text-red-600"
    }
  ];

  const copyToClipboard = async (url, formType) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedForm(formType);
      setTimeout(() => setCopiedForm(""), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const openInNewTab = (url) => {
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-7 w-7 text-blue-600" />
            Google Forms Management
          </h2>
          <p className="mt-2 text-gray-600">
            Share these Google Forms with church members to collect financial data directly into the system.
          </p>
        </div>

        <div className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {googleForms.map((form, index) => (
              <div key={index} className={`rounded-lg border-2 p-6 ${form.color} transition-all hover:shadow-md`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <FileText className={`h-6 w-6 ${form.iconColor}`} />
                      <h3 className="text-xl font-semibold text-gray-900">{form.title}</h3>
                    </div>
                    
                    <p className="text-gray-700 mb-4">{form.description}</p>
                    
                    <div className="bg-white rounded-lg p-3 border border-gray-200 mb-4">
                      <p className="text-sm text-gray-600 mb-2">Google Form Link:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs text-blue-600 bg-blue-50 p-2 rounded border break-all">
                          {form.url}
                        </code>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => copyToClipboard(form.url, form.title)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-1 justify-center"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedForm === form.title ? 'Copied!' : 'Copy Link'}
                      </button>
                      
                      <button
                        onClick={() => openInNewTab(form.url)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex-1 justify-center"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Form
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-blue-900 mb-2">Instructions for Sharing</h4>
                <ul className="text-blue-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                    Copy the link for the appropriate form (Collection or Expense)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                    Share via email, WhatsApp, or other messaging platforms with authorized church members
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                    Form submissions will automatically appear in the Financial Records Manager
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                    Only users with valid email addresses in the system can submit forms
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
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
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);

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
    (sum, item) => sum + (item.total_amount || 0),
    0
  );
  const totalExpenses = expenses.reduce(
    (sum, item) => sum + (item.total_amount || 0),
    0
  );
  const netBalance = totalCollections - totalExpenses;

  // Process data for charts - with real-time updates
  const processWeeklyTrends = () => {
    const weeks = {};

    collections.forEach((item) => {
      const date = new Date(item.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `Week ${weekNum}`;

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      }
      weeks[weekKey].collections += item.total_amount || 0;
    });

    expenses.forEach((item) => {
      const date = new Date(item.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `Week ${weekNum}`;

      if (!weeks[weekKey]) {
        weeks[weekKey] = { week: weekKey, collections: 0, expenses: 0, net: 0 };
      }
      weeks[weekKey].expenses += item.total_amount || 0;
    });

    // Calculate net for each week
    Object.values(weeks).forEach((week) => {
      week.net = week.collections - week.expenses;
    });

    return Object.values(weeks).sort(
      (a, b) => parseInt(a.week.split(" ")[1]) - parseInt(b.week.split(" ")[1])
    );
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
      breakdown["PBCM Share"] += expense.pbcm_share_expense || 0;
      breakdown["Pastoral Workers"] += expense.pastoral_worker_support || 0;
      breakdown["CAP-Churches"] += expense.cap_assistance || 0;
      breakdown["Honorarium"] += expense.honorarium || 0;
      breakdown["Conference/Seminar"] += expense.conference_seminar || 0;
      breakdown["Fellowship Events"] += expense.fellowship_events || 0;
      breakdown["Anniversary/Christmas"] += expense.anniversary_christmas || 0;
      breakdown["Supplies"] += expense.supplies || 0;
      breakdown["Utilities"] += expense.utilities || 0;
      breakdown["Vehicle Maintenance"] += expense.vehicle_maintenance || 0;
      breakdown["LTO Registration"] += expense.lto_registration || 0;
      breakdown["Transportation & Gas"] += expense.transportation_gas || 0;
      breakdown["Building Maintenance"] += expense.building_maintenance || 0;
      breakdown["ABCCOP National"] += expense.abccop_national || 0;
      breakdown["CBCC Share"] += expense.cbcc_share || 0;
      breakdown["Kabalikat Share"] += expense.kabalikat_share || 0;
      breakdown["ABCCOP Community"] += expense.abccop_community || 0;
    });

    const colors = [
      "#8884d8",
      "#82ca9d",
      "#ffc658",
      "#ff7300",
      "#8dd1e1",
      "#d084d0",
      "#ffb347",
      "#87ceeb",
    ];

    return Object.entries(breakdown)
      .filter(([_, value]) => value > 0)
      .map(([name, value], index) => ({
        name,
        value,
        fill: colors[index % colors.length], // FIXED: changed from 'color' to 'fill'
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
      "Couples": 0,
      "Bank Interest": 0,
      "Special Purpose Pledge": 0,
    };

    collections.forEach((item) => {
      sources["General Tithes & Offering"] += item.general_tithes_offering || 0;
      sources["Sunday School"] += item.sunday_school || 0;
      sources["Youth"] += item.youth || 0;
      sources["Sisterhood San Juan"] += item.sisterhood_san_juan || 0;
      sources["Sisterhood Labuin"] += item.sisterhood_labuin || 0;
      sources["Brotherhood"] += item.brotherhood || 0;
      sources["Couples"] += item.couples || 0;
      sources["Bank Interest"] += item.bank_interest || 0;
      sources["Special Purpose Pledge"] += item.special_purpose_pledge || 0;
    });

    const colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#8dd1e1"];

    return Object.entries(sources)
      .filter(([_, value]) => value > 0)
      .map(([name, value], index) => ({
        name,
        value,
        fill: colors[index % colors.length],
      }));
  };

  // Recalculate chart data when collections/expenses change
  const weeklyTrends = processWeeklyTrends();
  const expenseBreakdown = processExpenseBreakdown();
  const collectionSources = processCollectionSources();

  const StatCard = ({
    title,
    value,
    icon: Icon,
    color = "blue",
    trend = null,
  }) => {
    const colorClasses = {
      blue: "from-blue-500 to-blue-600",
      green: "from-green-500 to-green-600", 
      red: "from-red-500 to-red-600",
      purple: "from-purple-500 to-purple-600"
    };
    
    return (
      <div className={`bg-gradient-to-r ${colorClasses[color]} rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center mb-3">
              <Icon className="w-6 h-6 mr-2 opacity-90" />
              <p className="text-sm font-medium opacity-90">{title}</p>
            </div>
            <p className="text-3xl font-bold mb-1">
              {typeof value === 'number' || !isNaN(parseFloat(value)) ? 
                (title.includes('Balance') || title.includes('Collections') || title.includes('Expenses') || title.includes('Surplus') ? '₱' : '') + formatCurrency(value) 
                : value}
            </p>
            {trend && (
              <p className="text-sm opacity-75">
                {trend > 0 ? "↗" : "↘"} {Math.abs(trend)}% vs last month
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.dataKey}: ₱{formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // If showing records manager, render it with callbacks
  if (showRecordsManager) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-4">
          <button
            onClick={() => setShowRecordsManager(false)}
            className="mb-4 flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <FinancialRecordsManager onDataChange={handleDataChange} />
        </div>
      </div>
    );
  }

  // If showing user management, render it
  if (showUserManagement) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-4">
          <button
            onClick={() => setShowUserManagement(false)}
            className="mb-4 flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <UserManagement user={user} />
        </div>
      </div>
    );
  }

  // If showing Google Forms, render it
  if (showGoogleForms) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-4">
          <button
            onClick={() => setShowGoogleForms(false)}
            className="mb-4 flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <GoogleFormsManager />
        </div>
      </div>
    );
  }


  // Sidebar component
  const Sidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
      sidebarOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">SBCC Financial</span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <nav className="mt-6 px-3">
        <div className="space-y-1">
          <button
            onClick={() => setSelectedView("overview")}
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
              selectedView === "overview"
                ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Home className="w-5 h-5 mr-3" />
            Dashboard
          </button>
          
          <button
            onClick={() => setSelectedView("analytics")}
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
              selectedView === "analytics"
                ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Activity className="w-5 h-5 mr-3" />
            Analytics
          </button>
          
          <button
            onClick={() => setSelectedView("reports")}
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
              selectedView === "reports"
                ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <BarChart3 className="w-5 h-5 mr-3" />
            Reports
          </button>
          
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <>
              <div className="border-t border-gray-200 my-4"></div>
              <button
                onClick={() => setShowRecordsManager(true)}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <Plus className="w-5 h-5 mr-3" />
                Manage Records
              </button>
              
              <button
                onClick={() => setShowUserManagement(true)}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <Users className="w-5 h-5 mr-3" />
                User Management
              </button>
              
              <button
                onClick={() => setShowGoogleForms(true)}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <FileText className="w-5 h-5 mr-3" />
                Google Forms
              </button>
            </>
          )}
          
          <div className="border-t border-gray-200 my-4"></div>
          
          <button
            onClick={handlePrint}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Printer className="w-5 h-5 mr-3" />
            Print Report
          </button>
          
          <button
            onClick={onLogout}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <Power className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </nav>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-blue-600">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 mr-2"
                >
                  <Menu className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    SBCC Financial Management System
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Welcome back, {user.name} • Last updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Search and Actions */}
              <div className="flex items-center space-x-4">
                <div className="relative hidden md:block">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <button
                  onClick={loadData}
                  disabled={loading}
                  className={`p-2 rounded-lg transition-colors ${
                    loading
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  title="Refresh data"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
          </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
          <div className="px-4 sm:px-6 lg:px-8 py-8">
            {/* Status Indicator */}
            <div className="mb-6 bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    {backendStatus === "connected" ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm font-medium text-gray-700">
                      Database: {backendStatus === "connected" ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Records: <span className="font-medium">{collections.length}</span> collections, <span className="font-medium">{expenses.length}</span> expenses
                  </div>
                </div>

                {loading && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Updating data...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Collections"
                value={totalCollections}
                icon={DollarSign}
                color="blue"
                trend={15.2}
              />
              <StatCard
                title="Total Expenses"
                value={totalExpenses}
                icon={TrendingDown}
                color="blue"
                trend={-8.1}
              />
              <StatCard
                title="Net Balance"
                value={netBalance}
                icon={netBalance >= 0 ? TrendingUp : TrendingDown}
                color={netBalance >= 0 ? "green" : "red"}
                trend={25.4}
              />
              <StatCard
                title="Monthly Surplus"
                value={(() => {
                  // Calculate current month's surplus
                  const currentMonth = new Date().getMonth();
                  const currentYear = new Date().getFullYear();

                  const monthlyCollections = collections.filter(item => {
                    const itemDate = new Date(item.date);
                    return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
                  }).reduce((sum, item) => sum + (item.total_amount || 0), 0);

                  const monthlyExpenses = expenses.filter(item => {
                    const itemDate = new Date(item.date);
                    return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
                  }).reduce((sum, item) => sum + (item.total_amount || 0), 0);

                  return monthlyCollections - monthlyExpenses;
                })()}
                icon={BarChart3}
                color="purple"
                trend={12.8}
              />
            </div>

        {selectedView === "overview" && (
          <>
            {/* Financial Trends Chart */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  Weekly Financial Trends
                </h3>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Real-time Data</span>
                </div>
              </div>

              {weeklyTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={weeklyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="collections"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="Collections"
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#ef4444"
                      strokeWidth={3}
                      name="Expenses"
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      name="Net Balance"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  No data available for chart. Add some financial records to see
                  trends.
                </div>
              )}
            </div>

            {/* Breakdown Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Expense Breakdown */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Expense Breakdown ({expenseBreakdown.length} categories)
                </h3>
                {expenseBreakdown.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={expenseBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expenseBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [
                            `₱${formatCurrency(value)}`,
                            "Amount",
                          ]}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-4 space-y-2">
                      {expenseBreakdown.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: item.fill }}
                            />
                            <span className="text-sm text-gray-600">
                              {item.name}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            ₱{formatCurrency(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    No expense data available. Add some expenses to see
                    breakdown.
                  </div>
                )}
              </div>

              {/* Collection Sources */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Collection Sources ({collectionSources.length} types)
                </h3>
                {collectionSources.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={collectionSources}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => [
                          `₱${formatCurrency(value)}`,
                          "Amount",
                        ]}
                      />
                      <Bar dataKey="value">
                        {collectionSources.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    No collection data available. Add some collections to see
                    sources.
                  </div>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Collections */}
              <div className="bg-white rounded-2xl shadow-lg">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900">
                    Recent Collections ({collections.length})
                  </h3>
                </div>
                <div className="p-6">
                  {collections.length > 0 ? (
                    <div className="space-y-4">
                      {collections.slice(0, 5).map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.particular}
                            </p>
                            <p className="text-sm text-gray-600">
                              {item.date} • {item.control_number}
                            </p>
                          </div>
                          <span className="font-bold text-green-600">
                            ₱{formatCurrency(item.total_amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      No collections found. Click "Manage Records" to add your
                      first collection.
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Expenses */}
              <div className="bg-white rounded-2xl shadow-lg">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900">
                    Recent Expenses ({expenses.length})
                  </h3>
                </div>
                <div className="p-6">
                  {expenses.length > 0 ? (
                    <div className="space-y-4">
                      {expenses.slice(0, 5).map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-gray-900" title={item.particular}>
                              {truncateText(item.particular, 40)}
                            </p>
                            <p className="text-sm text-gray-600">
                              {item.date} • {item.forms_number}
                            </p>
                          </div>
                          <span className="font-bold text-red-600">
                            ₱{formatCurrency(item.total_amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      No expenses found. Click "Manage Records" to add your
                      first expense.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {selectedView === "analytics" && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Financial Analytics
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Monthly Comparison */}
              <div>
                <h4 className="text-lg font-semibold mb-4">
                  Monthly Comparison
                </h4>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={weeklyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="collections"
                      stackId="1"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stackId="2"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Financial Health Indicators */}
              <div>
                <h4 className="text-lg font-semibold mb-4">Financial Health</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-800">
                        {netBalance > 0
                          ? "Healthy Cash Flow"
                          : "Cash Flow Alert"}
                      </span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      {netBalance > 0
                        ? `Collections exceed expenses by ${Math.round(
                            (totalCollections / totalExpenses - 1) * 100
                          )}%`
                        : "Expenses exceed collections"}
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-800">
                        Net Balance
                      </span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      ₱{formatCurrency(netBalance)} this period
                    </p>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center space-x-2">
                      <PieChartIcon className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-800">
                        Records Count
                      </span>
                    </div>
                    <p className="text-sm text-yellow-600 mt-1">
                      {collections.length} collections, {expenses.length}{" "}
                      expenses
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedView === "reports" && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Financial Reports
              </h3>
              <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-6 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">
                  Collections Summary
                </h4>
                <p className="text-2xl font-bold text-green-600">
                  ₱{formatCurrency(totalCollections)}
                </p>
                <p className="text-sm text-gray-600">
                  {collections.length} transactions
                </p>
              </div>

              <div className="p-6 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">
                  Expenses Summary
                </h4>
                <p className="text-2xl font-bold text-red-600">
                  ₱{formatCurrency(totalExpenses)}
                </p>
                <p className="text-sm text-gray-600">
                  {expenses.length} transactions
                </p>
              </div>

              <div className="p-6 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">
                  Net Surplus
                </h4>
                <p className="text-2xl font-bold text-blue-600">
                  ₱{formatCurrency(netBalance)}
                </p>
                <p className="text-sm text-gray-600">
                  {totalExpenses > 0
                    ? Math.round((totalCollections / totalExpenses) * 100)
                    : 0}
                  % efficiency
                </p>
              </div>
            </div>

            <div className="prose max-w-none">
              <h4 className="text-lg font-semibold mb-4">
                Real-time Financial Report
              </h4>
              <p className="text-gray-600 mb-4">
                The church maintains {netBalance > 0 ? "strong" : "concerning"}{" "}
                financial health with current data showing {collections.length}{" "}
                collection records and {expenses.length} expense records. Last
                updated: {lastUpdated.toLocaleString()}.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-blue-800 font-medium">💡 Live Data</p>
                <p className="text-blue-700 text-sm mt-1">
                  This report updates automatically when you add, edit, or
                  delete financial records. All charts and calculations reflect
                  real-time data from your database.
                </p>
              </div>
            </div>
          </div>
        )}
          </div>
        </main>
      </div>

      {/* Print Report Modal */}
      <PrintReportModal 
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        user={user}
      />
    </div>
  );
};

export default Dashboard;
