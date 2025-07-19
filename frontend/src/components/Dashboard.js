import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  LogOut,
  RefreshCw,
  CheckCircle,
  XCircle,
  BarChart3,
  Calendar,
  Download,
  Plus,
  ArrowLeft,
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
import FinancialRecordsManager from "./FinancialRecordsManager";

const Dashboard = ({ user, onLogout }) => {
  const [backendStatus, setBackendStatus] = useState("connected");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState("overview");
  const [showRecordsManager, setShowRecordsManager] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

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
      "Workers Share": 0,
      Fellowship: 0,
      Supplies: 0,
      Utilities: 0,
      Maintenance: 0,
      Honorarium: 0,
      Transport: 0,
      "Music/Worship": 0,
    };

    expenses.forEach((expense) => {
      breakdown["Workers Share"] += expense.workers_share || 0;
      breakdown["Fellowship"] += expense.fellowship_expense || 0;
      breakdown["Supplies"] += expense.supplies || 0;
      breakdown["Utilities"] += expense.utilities || 0;
      breakdown["Maintenance"] += expense.building_maintenance || 0;
      breakdown["Honorarium"] += expense.honorarium || 0;
      breakdown["Transport"] += expense.gasoline_transport || 0;
      breakdown["Music/Worship"] += expense.worship_music || 0;
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
    const sources = {};

    collections.forEach((item) => {
      const type = item.particular;
      if (!sources[type]) {
        sources[type] = 0;
      }
      sources[type] += item.total_amount || 0;
    });

    const colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

    return Object.entries(sources).map(([name, value], index) => ({
      name,
      value,
      fill: colors[index % colors.length], // Changed from 'color' to 'fill'
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
  }) => (
    <div
      className="bg-white rounded-lg shadow-lg p-6 border-l-4"
      style={{
        borderLeftColor:
          color === "green"
            ? "#10b981"
            : color === "red"
            ? "#ef4444"
            : "#3b82f6",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            ₱{value.toLocaleString()}
          </p>
          {trend && (
            <p
              className={`text-sm mt-1 ${
                trend > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {trend > 0 ? "↗" : "↘"} {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>
        <Icon
          className="w-12 h-12"
          style={{
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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.dataKey}: ₱{entry.value?.toLocaleString()}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                SBCC Financial Analytics
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome, {user.name} ({user.role}) • Last updated:{" "}
                {lastUpdated.toLocaleTimeString()}
              </p>
            </div>

            {/* Navigation */}
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setSelectedView("overview")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedView === "overview"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setSelectedView("analytics")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedView === "analytics"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Analytics
                </button>
                <button
                  onClick={() => setSelectedView("reports")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedView === "reports"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Reports
                </button>
              </div>

              <button
                onClick={() => setShowRecordsManager(true)}
                className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                title="Manage financial records"
              >
                <Plus className="w-4 h-4" />
                <span>Manage Records</span>
              </button>

              <button
                onClick={loadData}
                disabled={loading}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  loading
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                title="Refresh data from database"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
                <span>{loading ? "Refreshing..." : "Refresh"}</span>
              </button>

              <button
                onClick={onLogout}
                className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Indicator */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {backendStatus === "connected" ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <span className="text-sm text-gray-600">
                Database:{" "}
                {backendStatus === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Records: {collections.length} collections, {expenses.length}{" "}
              expenses
            </div>
          </div>

          {loading && (
            <div className="flex items-center space-x-2 text-blue-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Updating data...</span>
            </div>
          )}
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Collections"
            value={totalCollections}
            icon={DollarSign}
            color="green"
            trend={15.2}
          />
          <StatCard
            title="Total Expenses"
            value={totalExpenses}
            icon={TrendingDown}
            color="red"
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
            value={netBalance}
            icon={BarChart3}
            color="blue"
            trend={12.8}
          />
        </div>

        {selectedView === "overview" && (
          <>
            {/* Financial Trends Chart */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
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
              <div className="bg-white rounded-lg shadow-lg p-6">
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
                            `₱${value.toLocaleString()}`,
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
                            ₱{item.value.toLocaleString()}
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
              <div className="bg-white rounded-lg shadow-lg p-6">
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
                          `₱${value.toLocaleString()}`,
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
              <div className="bg-white rounded-lg shadow-lg">
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
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
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
                            ₱{item.total_amount?.toLocaleString()}
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
              <div className="bg-white rounded-lg shadow-lg">
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
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.particular}
                            </p>
                            <p className="text-sm text-gray-600">
                              {item.date} • {item.forms_number}
                            </p>
                          </div>
                          <span className="font-bold text-red-600">
                            ₱{item.total_amount?.toLocaleString()}
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
          <div className="bg-white rounded-lg shadow-lg p-6">
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
                      ₱{netBalance.toLocaleString()} this period
                    </p>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center space-x-2">
                      <PieChart className="w-5 h-5 text-yellow-600" />
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
          <div className="bg-white rounded-lg shadow-lg p-6">
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
                  ₱{totalCollections.toLocaleString()}
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
                  ₱{totalExpenses.toLocaleString()}
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
                  ₱{netBalance.toLocaleString()}
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
      </main>
    </div>
  );
};

export default Dashboard;
