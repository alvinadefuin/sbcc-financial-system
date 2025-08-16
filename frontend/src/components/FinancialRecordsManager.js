import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Filter,
  Save,
  X,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import apiService from "../utils/api";

const FinancialRecordsManager = ({ onDataChange }) => {
  const [activeTab, setActiveTab] = useState("collections");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [collectionsData, expensesData] = await Promise.all([
        apiService.getCollections(),
        apiService.getExpenses(),
      ]);
      setCollections(collectionsData);
      setExpenses(expensesData);
      console.log("CRUD Manager data loaded:", {
        collections: collectionsData.length,
        expenses: expensesData.length,
      });
    } catch (error) {
      showNotification("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const generateControlNumber = () => {
    const year = new Date().getFullYear();
    const maxNumber = collections
      .filter(
        (c) => c.control_number && c.control_number.startsWith(year.toString())
      )
      .map((c) => {
        const match = c.control_number.match(/\d+$/);
        return match ? parseInt(match[0]) : 0;
      })
      .reduce((max, num) => Math.max(max, num), 0);

    return `${year}-${String(maxNumber + 1).padStart(3, "0")}`;
  };

  const generateFormNumber = () => {
    const year = new Date().getFullYear();
    const maxNumber = expenses
      .filter(
        (e) => e.forms_number && e.forms_number.startsWith(year.toString())
      )
      .map((e) => {
        const match = e.forms_number.match(/\d+$/);
        return match ? parseInt(match[0]) : 0;
      })
      .reduce((max, num) => Math.max(max, num), 0);

    return `${year}-${String(maxNumber + 1).padStart(3, "0")}`;
  };

  // Auto-populate breakdown fields based on SBCC's actual categorization system
  const autoPopulateBreakdown = (particular, totalAmount) => {
    const amount = parseFloat(totalAmount) || 0;
    if (amount === 0) return {};

    // Reset all breakdown fields
    const breakdown = {
      workers_share: 0,
      benevolence_donations: 0,
      honorarium: 0,
      fellowship_expense: 0,
      supplies: 0,
      utilities: 0,
      vehicle_maintenance: 0,
      gasoline_transport: 0,
      building_maintenance: 0,
      pbcm_share: 0,
      mission_evangelism: 0,
      admin_expense: 0,
      worship_music: 0,
      discipleship: 0,
      pastoral_care: 0,
    };

    // Auto-map based on SBCC's actual categorization from January 2023 records
    const desc = particular.toLowerCase();

    // Workers Share - Love gifts for regular workers
    if (desc.includes("love gift for marife") || desc.includes("marife")) {
      breakdown.workers_share = amount;
    }

    // Fellowship Expense - Food, road mapping, fellowship activities, speaker expenses
    else if (
      desc.includes("gasoline") ||
      desc.includes("food") ||
      desc.includes("fellowship") ||
      desc.includes("christmas") ||
      desc.includes("visitors") ||
      desc.includes("odm")
    ) {
      breakdown.fellowship_expense = amount;
    }

    // Supplies - Office supplies, bottled water, batteries
    else if (
      desc.includes("supplies") ||
      desc.includes("bottled water") ||
      desc.includes("batteries") ||
      desc.includes("office") ||
      desc.includes("paper") ||
      desc.includes("materials")
    ) {
      breakdown.supplies = amount;
    }

    // Utilities - Water bill, electricity, phone
    else if (
      desc.includes("water bill") ||
      desc.includes("utilities") ||
      desc.includes("electric") ||
      desc.includes("phone") ||
      desc.includes("internet")
    ) {
      breakdown.utilities = amount;
    }

    // Worship/Prayer/Music - Music team snacks and related expenses
    else if (
      desc.includes("music team") ||
      desc.includes("music") ||
      desc.includes("worship") ||
      desc.includes("prayer") ||
      desc.includes("sound") ||
      desc.includes("instruments")
    ) {
      breakdown.worship_music = amount;
    }

    // Building Repairs & Maintenance - Maintenance items like bidet, repairs
    else if (
      desc.includes("building") ||
      desc.includes("maintenance") ||
      desc.includes("repair") ||
      desc.includes("bidet") ||
      desc.includes("cr") ||
      desc.includes("comfort room") ||
      desc.includes("painting") ||
      desc.includes("cleaning")
    ) {
      breakdown.building_maintenance = amount;
    }

    // Honorarium - Speaker honorariums (formal speaking engagements)
    else if (
      desc.includes("road mapping") ||
      desc.includes("honorarium") ||
      desc.includes("seminar") ||
      desc.includes("elder") ||
      desc.includes("retreat") ||
      (desc.includes("speaker") && desc.includes("love gift")) ||
      (desc.includes("speaker") && desc.includes("food"))
    ) {
      breakdown.honorarium = amount;
    }

    // Gasoline & Transport - Transportation expenses
    else if (
      desc.includes("gasoline") ||
      desc.includes("transport") ||
      desc.includes("fare") ||
      desc.includes("travel") ||
      desc.includes("vehicle")
    ) {
      breakdown.gasoline_transport = amount;
    }

    // PBCM Share - Share for PBCM organization
    else if (desc.includes("pbcm") || desc.includes("share")) {
      breakdown.pbcm_share = amount;
    }

    // Mission & Evangelism - Outreach activities
    else if (
      desc.includes("mission") ||
      desc.includes("evangelism") ||
      desc.includes("outreach")
    ) {
      breakdown.mission_evangelism = amount;
    }

    // Benevolence & Donations - Charitable giving
    else if (
      desc.includes("benevolence") ||
      desc.includes("donation") ||
      desc.includes("charity") ||
      desc.includes("help") ||
      desc.includes("assistance")
    ) {
      breakdown.benevolence_donations = amount;
    }

    // Admin - Administrative expenses
    else if (
      desc.includes("admin") ||
      desc.includes("registration") ||
      desc.includes("fee") ||
      desc.includes("permit") ||
      desc.includes("documents")
    ) {
      breakdown.admin_expense = amount;
    }

    // Default fallback - If no specific category matches, put in Fellowship Expense
    // (Based on SBCC pattern where most miscellaneous items go to Fellowship)
    else {
      breakdown.fellowship_expense = amount;
    }

    return breakdown;
  };

  const handleAddRecord = async (formData) => {
    try {
      console.log("➕ CRUD: Adding", activeTab, "record:", formData);

      if (activeTab === "collections") {
        const newRecord = await apiService.addCollection(formData);
        setCollections([...collections, newRecord]);
        showNotification("Collection added successfully!");
        console.log("✅ Collection added with ID:", newRecord.id);
      } else {
        const newRecord = await apiService.addExpense(formData);
        setExpenses([...expenses, newRecord]);
        showNotification("Expense added successfully!");
        console.log("✅ Expense added with ID:", newRecord.id);
      }
      setShowAddForm(false);

      // Notify parent component that data has changed
      if (onDataChange) {
        console.log("📡 CRUD: Notifying dashboard of data change");
        await onDataChange();
        console.log("📡 CRUD: Dashboard notification completed");
      } else {
        console.warn("⚠️ CRUD: No onDataChange callback provided!");
      }
    } catch (error) {
      showNotification("Failed to add record", "error");
      console.error("❌ Add record error:", error);
    }
  };

  const handleEditRecord = async (id, formData) => {
    try {
      console.log(
        "✏️ CRUD: Editing",
        activeTab,
        "record ID:",
        id,
        "with data:",
        formData
      );

      if (activeTab === "collections") {
        await apiService.updateCollection(id, formData);
        setCollections(
          collections.map((c) => (c.id === id ? { ...c, ...formData } : c))
        );
        showNotification("Collection updated successfully!");
        console.log("✅ Collection updated with ID:", id);
      } else {
        await apiService.updateExpense(id, formData);
        setExpenses(
          expenses.map((e) => (e.id === id ? { ...e, ...formData } : e))
        );
        showNotification("Expense updated successfully!");
        console.log("✅ Expense updated with ID:", id);
      }
      setEditingRecord(null);

      // Notify parent component that data has changed
      if (onDataChange) {
        console.log("📡 CRUD: Notifying dashboard of data change");
        await onDataChange();
        console.log("📡 CRUD: Dashboard notification completed");
      } else {
        console.warn("⚠️ CRUD: No onDataChange callback provided!");
      }
    } catch (error) {
      showNotification("Failed to update record", "error");
      console.error("❌ Update record error:", error);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    try {
      console.log("🗑️ CRUD: Deleting", activeTab, "record ID:", id);

      if (activeTab === "collections") {
        await apiService.deleteCollection(id);
        setCollections(collections.filter((c) => c.id !== id));
        showNotification("Collection deleted successfully!");
        console.log("✅ Collection deleted with ID:", id);
      } else {
        await apiService.deleteExpense(id);
        setExpenses(expenses.filter((e) => e.id !== id));
        showNotification("Expense deleted successfully!");
        console.log("✅ Expense deleted with ID:", id);
      }

      // Notify parent component that data has changed
      if (onDataChange) {
        console.log("📡 CRUD: Notifying dashboard of data change");
        await onDataChange();
        console.log("📡 CRUD: Dashboard notification completed");
      } else {
        console.warn("⚠️ CRUD: No onDataChange callback provided!");
      }
    } catch (error) {
      showNotification("Failed to delete record", "error");
      console.error("❌ Delete record error:", error);
    }
  };

  // FIXED: Safe filtering with null checks
  const filteredRecords = (
    activeTab === "collections" ? collections : expenses
  ).filter((record) => {
    const particular = record.particular || "";
    const controlNumber = record.control_number || "";
    const formsNumber = record.forms_number || "";
    const date = record.date || "";

    const matchesSearch =
      particular.toLowerCase().includes(searchTerm.toLowerCase()) ||
      controlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      formsNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !filterDate || date.includes(filterDate);
    return matchesSearch && matchesDate;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Financial Records Management
              </h1>
              <p className="text-gray-600 mt-1">
                Add, edit, and manage church financial records
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>
                Add {activeTab === "collections" ? "Collection" : "Expense"}
              </span>
            </button>
          </div>
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${
              notification.type === "error"
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-green-50 border border-green-200 text-green-800"
            }`}
          >
            {notification.type === "error" ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab("collections")}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === "collections"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4" />
                  <span>Collections ({collections.length})</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("expenses")}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === "expenses"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>Expenses ({expenses.length})</span>
                </div>
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0">
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by description, control number, or form number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <input
                  type="month"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTab === "collections" ? "Control #" : "Form #"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      Loading records...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      No records found.{" "}
                      {searchTerm || filterDate
                        ? "Try adjusting your filters."
                        : "Add your first record!"}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.date}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {record.particular}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {activeTab === "collections"
                          ? record.control_number
                          : record.forms_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ₱{record.total_amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setEditingRecord(record)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="Edit record"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Delete record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Collections
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱
                  {collections
                    .reduce((sum, c) => sum + (c.total_amount || 0), 0)
                    .toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Expenses
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱
                  {expenses
                    .reduce((sum, e) => sum + (e.total_amount || 0), 0)
                    .toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Net Balance</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₱
                  {(
                    collections.reduce(
                      (sum, c) => sum + (c.total_amount || 0),
                      0
                    ) -
                    expenses.reduce((sum, e) => sum + (e.total_amount || 0), 0)
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {(showAddForm || editingRecord) && (
        <RecordFormModal
          isOpen={showAddForm || !!editingRecord}
          onClose={() => {
            setShowAddForm(false);
            setEditingRecord(null);
          }}
          onSubmit={
            editingRecord
              ? (data) => handleEditRecord(editingRecord.id, data)
              : handleAddRecord
          }
          recordType={activeTab}
          initialData={editingRecord}
          isEditing={!!editingRecord}
          generateControlNumber={generateControlNumber}
          generateFormNumber={generateFormNumber}
          autoPopulateBreakdown={autoPopulateBreakdown}
        />
      )}
    </div>
  );
};

const RecordFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  recordType,
  initialData,
  isEditing,
  generateControlNumber,
  generateFormNumber,
  autoPopulateBreakdown,
}) => {
  const [formData, setFormData] = useState({
    date: initialData?.date || new Date().toISOString().split("T")[0],
    particular: initialData?.particular || "",
    control_number: initialData?.control_number || "",
    forms_number: initialData?.forms_number || "",
    cheque_number: initialData?.cheque_number || "",
    total_amount: initialData?.total_amount || "",
    // New collection fields
    general_tithes_offering: initialData?.general_tithes_offering || "",
    bank_interest: initialData?.bank_interest || "",
    sisterhood_san_juan: initialData?.sisterhood_san_juan || "",
    sisterhood_labuin: initialData?.sisterhood_labuin || "",
    brotherhood: initialData?.brotherhood || "",
    youth: initialData?.youth || "",
    couples: initialData?.couples || "",
    sunday_school: initialData?.sunday_school || "",
    special_purpose_pledge: initialData?.special_purpose_pledge || "",
    // New expense fields
    category: initialData?.category || "",
    subcategory: initialData?.subcategory || "",
    budget_amount: initialData?.budget_amount || "",
    fund_source: initialData?.fund_source || "operational",
    pbcm_share_expense: initialData?.pbcm_share_expense || "",
    pastoral_worker_support: initialData?.pastoral_worker_support || "",
    cap_assistance: initialData?.cap_assistance || "",
    honorarium: initialData?.honorarium || "",
    conference_seminar: initialData?.conference_seminar || "",
    fellowship_events: initialData?.fellowship_events || "",
    anniversary_christmas: initialData?.anniversary_christmas || "",
    supplies: initialData?.supplies || "",
    utilities: initialData?.utilities || "",
    vehicle_maintenance: initialData?.vehicle_maintenance || "",
    lto_registration: initialData?.lto_registration || "",
    transportation_gas: initialData?.transportation_gas || "",
    building_maintenance: initialData?.building_maintenance || "",
    abccop_national: initialData?.abccop_national || "",
    cbcc_share: initialData?.cbcc_share || "",
    kabalikat_share: initialData?.kabalikat_share || "",
    abccop_community: initialData?.abccop_community || "",
  });

  const [errors, setErrors] = useState({});

  // Predefined options for dropdowns
  const collectionTypes = [
    "Tithes & Offerings",
    "Special Offerings",
    "Love Offerings",
    "Mission Offerings",
    "Building Fund",
    "Christmas Offerings",
    "Easter Offerings",
    "Thanksgiving Offerings",
  ];

  const expenseTypes = [
    "Love gift for Marife",
    "Love gift for Speaker",
    "Road mapping to PBCC",
    "Food for Speaker & Visitors",
    "Food for Speaker",
    "Expenses of Speaker",
    "Music team snacks",
    "Music team expenses",
    "Fellowship expenses",
    "Christmas fellowship",
    "Building maintenance",
    "Bidet & spray for CR",
    "Utilities payment",
    "Water bill",
    "Electric bill",
    "Office supplies",
    "Bottled water",
    "Batteries",
    "Transportation",
    "Gasoline",
    "Honorarium",
    "Seminar expenses",
    "Retreat expenses",
    "Ministry expenses",
    "PBCM Share",
    "Mission expenses",
    "Evangelism outreach",
    "Admin expenses",
    "Registration fees",
  ];

  // Auto-generate numbers when form opens (for new records only)
  useEffect(() => {
    if (!isEditing) {
      if (recordType === "collections" && !formData.control_number) {
        setFormData((prev) => ({
          ...prev,
          control_number: generateControlNumber(),
        }));
      } else if (recordType === "expenses" && !formData.forms_number) {
        setFormData((prev) => ({
          ...prev,
          forms_number: generateFormNumber(),
        }));
      }
    }
  }, [recordType, isEditing, generateControlNumber, generateFormNumber, formData.control_number, formData.forms_number]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.particular) newErrors.particular = "Description is required";
    if (!formData.total_amount || formData.total_amount <= 0) {
      newErrors.total_amount = "Amount must be greater than 0";
    }

    if (recordType === "collections" && !formData.control_number) {
      newErrors.control_number = "Control number is required";
    }

    if (recordType === "expenses" && !formData.forms_number) {
      newErrors.forms_number = "Form number is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      let submitData = { ...formData };

      // For expenses: Auto-populate breakdown fields if they're empty
      if (recordType === "expenses") {
        const hasManualBreakdown = Object.values({
          workers_share: formData.workers_share,
          benevolence_donations: formData.benevolence_donations,
          honorarium: formData.honorarium,
          fellowship_expense: formData.fellowship_expense,
          supplies: formData.supplies,
          utilities: formData.utilities,
          gasoline_transport: formData.gasoline_transport,
          building_maintenance: formData.building_maintenance,
          pbcm_share: formData.pbcm_share,
          mission_evangelism: formData.mission_evangelism,
          admin_expense: formData.admin_expense,
          worship_music: formData.worship_music,
        }).some((val) => val && val > 0);

        // For expenses: Auto-populate breakdown fields if they're empty
        if (
          !hasManualBreakdown &&
          formData.particular &&
          formData.total_amount
        ) {
          console.log(
            "🤖 Auto-populating expense breakdown for:",
            formData.particular
          );
          const autoBreakdown = autoPopulateBreakdown(
            formData.particular,
            formData.total_amount
          );
          submitData = { ...submitData, ...autoBreakdown };
          console.log("🤖 Auto-breakdown result:", autoBreakdown);
        }
      }

      console.log("📋 Submitting form data:", submitData);
      onSubmit(submitData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? "Edit" : "Add"}{" "}
              {recordType === "collections" ? "Collection" : "Expense"}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.date ? "border-red-300" : "border-gray-300"
                }`}
              />
              {errors.date && (
                <p className="text-red-500 text-sm mt-1">{errors.date}</p>
              )}
            </div>

            {/* Auto Control/Form Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {recordType === "collections"
                  ? "Control Number *"
                  : "Form Number *"}
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={
                    recordType === "collections"
                      ? formData.control_number
                      : formData.forms_number
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [recordType === "collections"
                        ? "control_number"
                        : "forms_number"]: e.target.value,
                    })
                  }
                  className={`flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors[
                      recordType === "collections"
                        ? "control_number"
                        : "forms_number"
                    ]
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (recordType === "collections") {
                      setFormData({
                        ...formData,
                        control_number: generateControlNumber(),
                      });
                    } else {
                      setFormData({
                        ...formData,
                        forms_number: generateFormNumber(),
                      });
                    }
                  }}
                  className="px-3 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 text-sm"
                >
                  Auto
                </button>
              </div>
              {errors[
                recordType === "collections" ? "control_number" : "forms_number"
              ] && (
                <p className="text-red-500 text-sm mt-1">
                  {
                    errors[
                      recordType === "collections"
                        ? "control_number"
                        : "forms_number"
                    ]
                  }
                </p>
              )}
            </div>

            {/* Cheque Number (Expenses only) */}
            {recordType === "expenses" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cheque Number
                </label>
                <input
                  type="text"
                  value={formData.cheque_number}
                  onChange={(e) =>
                    setFormData({ ...formData, cheque_number: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="7626478"
                />
              </div>
            )}

            {/* Description Dropdown */}
            <div className={recordType === "expenses" ? "" : "md:col-span-1"}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <select
                value={formData.particular}
                onChange={(e) =>
                  setFormData({ ...formData, particular: e.target.value })
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.particular ? "border-red-300" : "border-gray-300"
                }`}
              >
                <option value="">Select description...</option>
                {(recordType === "collections"
                  ? collectionTypes
                  : expenseTypes
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
                <option value="custom">Custom (type below)</option>
              </select>

              {formData.particular === "custom" && (
                <input
                  type="text"
                  placeholder="Enter custom description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={(e) =>
                    setFormData({ ...formData, particular: e.target.value })
                  }
                />
              )}

              {errors.particular && (
                <p className="text-red-500 text-sm mt-1">{errors.particular}</p>
              )}
            </div>

            {/* Total Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    total_amount: parseFloat(e.target.value) || "",
                  })
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.total_amount ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="0.00"
              />
              {errors.total_amount && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.total_amount}
                </p>
              )}
            </div>
          </div>

          {/* Category-specific fields */}
          {recordType === "collections" ? (
            <div className="mt-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">
                Collection Breakdown
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tithes & Offerings
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tithes_offerings}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tithes_offerings: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PBCM Share
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.pbcm_share}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pbcm_share: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Operating Funds
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.operating_funds}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        operating_funds: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-medium text-gray-900">
                  Expense Breakdown
                </h4>
                {formData.particular && formData.total_amount && (
                  <button
                    type="button"
                    onClick={() => {
                      const autoBreakdown = autoPopulateBreakdown(
                        formData.particular,
                        formData.total_amount
                      );
                      setFormData({ ...formData, ...autoBreakdown });
                    }}
                    className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
                  >
                    🤖 Auto-Fill Categories
                  </button>
                )}
              </div>

              {formData.particular && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    💡 <strong>Smart Mapping:</strong> "{formData.particular}"
                    will be automatically categorized. You can override by
                    filling fields manually or clicking "Auto-Fill Categories".
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Workers Share
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.workers_share}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        workers_share: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Love gifts for workers"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Benevolence & Donations
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.benevolence_donations}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        benevolence_donations: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Charitable giving"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Honorarium
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.honorarium}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        honorarium: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Speaker fees, seminars"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fellowship Expense
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.fellowship_expense}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fellowship_expense: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Food, fellowships, speakers"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supplies
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.supplies}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        supplies: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Bottled water, batteries, office"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Utilities
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.utilities}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        utilities: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Water bill, electricity"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gasoline & Transport
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.gasoline_transport}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gasoline_transport: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Road mapping, transportation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Building Repairs & Maintenance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.building_maintenance}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        building_maintenance: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Bidet, repairs, maintenance"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Worship / Prayer / Music
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.worship_music}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        worship_music: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Music team snacks, instruments"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PBCM Share
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.pbcm_share}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pbcm_share: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="PBCM organization share"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mission & Evangelism
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.mission_evangelism}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        mission_evangelism: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Outreach activities"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Admin Expense
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.admin_expense}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        admin_expense: parseFloat(e.target.value) || "",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Registration fees, permits"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Save className="w-4 h-4" />
              <span>{isEditing ? "Update" : "Save"} Record</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialRecordsManager;
