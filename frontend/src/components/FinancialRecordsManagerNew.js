import React, { useState, useEffect } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Save,
  X,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import apiService from "../utils/api";

const FinancialRecordsManagerNew = ({ onDataChange }) => {
  // Currency formatting utility functions
  const formatCurrency = (value) => {
    if (!value || value === "") return "";
    const numValue = parseFloat(value) || 0;
    return numValue.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const parseCurrency = (value) => {
    if (!value || value === "") return "";
    return parseFloat(value.toString().replace(/,/g, '')) || 0;
  };

  // Auto-calculate total amount when individual fields change
  const calculateTotal = (data, recordType) => {
    if (recordType === "collections") {
      // Parse both formatted (with commas) and unformatted numbers
      const parseValue = (value) => {
        if (!value || value === "") return 0;
        // Remove commas and parse as float
        return parseFloat(value.toString().replace(/,/g, '')) || 0;
      };

      return parseValue(data.general_tithes_offering) +
             parseValue(data.bank_interest) +
             parseValue(data.sisterhood_san_juan) +
             parseValue(data.sisterhood_labuin) +
             parseValue(data.brotherhood) +
             parseValue(data.youth) +
             parseValue(data.couples) +
             parseValue(data.sunday_school) +
             parseValue(data.special_purpose_pledge);
    } else {
      // For expenses, just return 0 for now since expense fields are not implemented in this component
      return 0;
    }
  };

  // Currency input handlers - allow normal typing, format only on blur
  const handleCurrencyInput = (fieldName, value) => {
    // Allow only digits and decimal point during typing
    const cleanValue = value.replace(/[^\d.]/g, '');
    setFormData(prev => ({
      ...prev,
      [fieldName]: cleanValue,
    }));
  };

  const handleCurrencyBlur = (fieldName, value) => {
    // Format as currency when user leaves the field
    const numValue = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      [fieldName]: numValue > 0 ? formatCurrency(numValue) : "",
    }));
  };
  const [activeTab, setActiveTab] = useState("collections");
  const [collections, setCollections] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [notification, setNotification] = useState(null);

  const [formData, setFormData] = useState({
    date: "",
    particular: "",
    control_number: "",
    forms_number: "",
    payment_method: "Cash",
    total_amount: "",
    // Collection fields
    general_tithes_offering: "",
    bank_interest: "",
    sisterhood_san_juan: "",
    sisterhood_labuin: "",
    brotherhood: "",
    youth: "",
    couples: "",
    sunday_school: "",
    special_purpose_pledge: "",
    // Expense fields
    category: "",
    subcategory: "",
    fund_source: "operational",
    cheque_number: "",
  });

  const [errors, setErrors] = useState({});

  // Auto-calculate total when individual fields change
  useEffect(() => {
    const calculatedTotal = calculateTotal(formData, activeTab);
    
    // Always auto-update total if there are individual field values
    if (calculatedTotal > 0) {
      setFormData(prev => ({ 
        ...prev, 
        total_amount: formatCurrency(calculatedTotal)
      }));
    } else if (calculatedTotal === 0) {
      // Clear total if no individual values
      setFormData(prev => ({ 
        ...prev, 
        total_amount: ""
      }));
    }
  }, [
    // Collection fields
    formData.general_tithes_offering, formData.bank_interest, formData.sisterhood_san_juan,
    formData.sisterhood_labuin, formData.brotherhood, formData.youth, formData.couples,
    formData.sunday_school, formData.special_purpose_pledge,
    activeTab
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [collectionsData, expensesData] = await Promise.all([
          apiService.getCollections(),
          apiService.getExpenses(),
        ]);
        setCollections(collectionsData);
        setExpenses(expensesData);
        if (onDataChange) {
          onDataChange({ collections: collectionsData, expenses: expensesData });
        }
      } catch (error) {
        showNotification("Failed to load data", "error");
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []); // Empty dependency array - only run once on mount

  const loadData = async () => {
    setLoading(true);
    try {
      const [collectionsData, expensesData] = await Promise.all([
        apiService.getCollections(),
        apiService.getExpenses(),
      ]);
      setCollections(collectionsData);
      setExpenses(expensesData);
      if (onDataChange) {
        onDataChange({ collections: collectionsData, expenses: expensesData });
      }
    } catch (error) {
      showNotification("Failed to load data", "error");
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const resetForm = () => {
    setFormData({
      date: "",
      particular: "",
      control_number: "",
      forms_number: "",
      payment_method: "Cash",
      total_amount: "",
      general_tithes_offering: "",
      bank_interest: "",
      sisterhood_san_juan: "",
      sisterhood_labuin: "",
      brotherhood: "",
      youth: "",
      couples: "",
      sunday_school: "",
      special_purpose_pledge: "",
      category: "",
      subcategory: "",
      fund_source: "operational",
      cheque_number: "",
    });
    setErrors({});
    setEditingRecord(null);
  };

  const handleAddRecord = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleEditRecord = (record) => {
    setFormData({ ...record });
    setEditingRecord(record);
    setShowAddForm(true);
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Date is always required
    if (!formData.date) newErrors.date = "Date is required";
    
    // Calculate total from individual fields
    let calculatedTotal = parseCurrency(formData.total_amount) || 0;
    let individualFieldsTotal = calculateTotal(formData, activeTab);

    // Use individual fields total if it exists and total_amount is 0 or empty
    const finalTotal = calculatedTotal > 0 ? calculatedTotal : individualFieldsTotal;

    // Validate that we have either a total_amount or some individual field values
    if (finalTotal <= 0) {
      newErrors.total_amount = activeTab === "collections" 
        ? "Either total amount or individual collection amounts must be provided"
        : "Either total amount or individual expense amounts must be provided";
    }

    // Category is required for expenses
    if (activeTab === "expenses" && !formData.category) {
      newErrors.category = "Category is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      // Convert currency formatted values back to numbers for API submission
      let submitData = { ...formData };
      
      // Convert only specific currency fields to numbers
      const currencyFields = [
        'total_amount', 'general_tithes_offering', 'bank_interest', 'sisterhood_san_juan',
        'sisterhood_labuin', 'brotherhood', 'youth', 'couples', 'sunday_school', 'special_purpose_pledge'
      ];
      
      currencyFields.forEach(field => {
        if (submitData[field] && typeof submitData[field] === 'string') {
          submitData[field] = parseCurrency(submitData[field]);
        }
      });

      // Ensure total_amount is properly calculated
      const individualFieldsTotal = calculateTotal(formData, activeTab);
      const currentTotal = parseCurrency(formData.total_amount) || 0;
      if (currentTotal === 0 && individualFieldsTotal > 0) {
        submitData.total_amount = individualFieldsTotal;
      }

      // Set default description if not provided
      if (!submitData.particular) {
        submitData.particular = activeTab === "collections" ? "Collection Entry" : "Expense Entry";
      }

      // Generate control number if not provided (for collections)
      if (activeTab === "collections" && !submitData.control_number) {
        // Generate format like: C2025-001, C2025-002, etc.
        const year = new Date().getFullYear();
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
        submitData.control_number = `C${year}-${timestamp}`;
      }
      
      if (editingRecord) {
        // Update existing record
        if (activeTab === "collections") {
          await apiService.updateCollection(editingRecord.id, submitData);
        } else {
          await apiService.updateExpense(editingRecord.id, submitData);
        }
        showNotification(`${activeTab.slice(0, -1)} updated successfully`);
      } else {
        // Add new record
        if (activeTab === "collections") {
          await apiService.addCollection(submitData);
        } else {
          await apiService.addExpense(submitData);
        }
        showNotification(`${activeTab.slice(0, -1)} added successfully`);
      }

      setShowAddForm(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error("Error saving record:", error);
      showNotification("Failed to save record", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;

    try {
      setLoading(true);
      if (activeTab === "collections") {
        await apiService.deleteCollection(id);
      } else {
        await apiService.deleteExpense(id);
      }
      showNotification(`${activeTab.slice(0, -1)} deleted successfully`);
      loadData();
    } catch (error) {
      console.error("Error deleting record:", error);
      showNotification("Failed to delete record", "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredData = (activeTab === "collections" ? collections : expenses).filter(
    (record) =>
      record.particular?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.id?.toString().includes(searchTerm)
  );

  // Expense categories for dropdown
  const expenseCategories = [
    "PBCM Share/PDOT",
    "Pastoral Team", 
    "Operational Fund"
  ];

  const operationalSubcategories = [
    "Pastoral & Worker Support",
    "CAP-Churches Assistance Program", 
    "Honorarium",
    "Conference/Seminar/Retreat/Assembly",
    "Fellowship Events",
    "Anniversary/Christmas Events",
    "Supplies",
    "Utilities",
    "Vehicle Maintenance",
    "LTO Registration",
    "Transportation & Gas",
    "Building Maintenance",
    "ABCCOP National",
    "CBCC Share",
    "Kabalikat Share",
    "ABCCOP Community Day"
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 flex items-center gap-2 ${
            notification.type === "error"
              ? "bg-red-100 text-red-800 border border-red-200"
              : "bg-green-100 text-green-800 border border-green-200"
          }`}
        >
          {notification.type === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Financial Records Manager
          </h2>
          <button
            onClick={handleAddRecord}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add {activeTab === "collections" ? "Collection" : "Expense"}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {["collections", "expenses"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md capitalize transition-colors ${
                activeTab === tab
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {editingRecord ? "Edit" : "Add"} {activeTab === "collections" ? "Collection" : "Expense"}
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Basic Fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.date ? "border-red-300" : "border-gray-300"
                }`}
              />
              {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={formData.particular}
                onChange={(e) => setFormData({ ...formData, particular: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.particular ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="Enter description"
              />
              {errors.particular && <p className="mt-1 text-sm text-red-600">{errors.particular}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Amount
              </label>
              <input
                type="text"
                value={formData.total_amount}
                onChange={(e) => handleCurrencyInput('total_amount', e.target.value)}
                onBlur={(e) => handleCurrencyBlur('total_amount', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.total_amount ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="30,188.00"
              />
              {errors.total_amount && <p className="mt-1 text-sm text-red-600">{errors.total_amount}</p>}
            </div>

            {/* Collection-specific fields */}
            {activeTab === "collections" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Control Number
                  </label>
                  <input
                    type="text"
                    value={formData.control_number}
                    onChange={(e) => setFormData({ ...formData, control_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    General Tithes & Offering
                  </label>
                  <input
                    type="text"
                    value={formData.general_tithes_offering}
                    onChange={(e) => handleCurrencyInput('general_tithes_offering', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('general_tithes_offering', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="30,123.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sisterhood San Juan
                  </label>
                  <input
                    type="text"
                    value={formData.sisterhood_san_juan}
                    onChange={(e) => handleCurrencyInput('sisterhood_san_juan', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sisterhood_san_juan', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sisterhood Labuin
                  </label>
                  <input
                    type="text"
                    value={formData.sisterhood_labuin}
                    onChange={(e) => handleCurrencyInput('sisterhood_labuin', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sisterhood_labuin', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Youth
                  </label>
                  <input
                    type="text"
                    value={formData.youth}
                    onChange={(e) => handleCurrencyInput('youth', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('youth', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sunday School
                  </label>
                  <input
                    type="text"
                    value={formData.sunday_school}
                    onChange={(e) => handleCurrencyInput('sunday_school', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sunday_school', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </>
            )}

            {/* Expense-specific fields */}
            {activeTab === "expenses" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: "" })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.category ? "border-red-300" : "border-gray-300"
                    }`}
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category}</p>}
                </div>

                {formData.category === "Operational Fund" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subcategory
                    </label>
                    <select
                      value={formData.subcategory}
                      onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select subcategory</option>
                      {operationalSubcategories.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Forms Number
                  </label>
                  <input
                    type="text"
                    value={formData.forms_number}
                    onChange={(e) => setFormData({ ...formData, forms_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    value={formData.cheque_number}
                    onChange={(e) => setFormData({ ...formData, cheque_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
              </>
            )}
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {loading ? "Saving..." : editingRecord ? "Update" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="p-6">
        {loading && !showAddForm ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading records...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No records found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? "No records match your search." : `No ${activeTab} recorded yet.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  {activeTab === "collections" && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Control #
                    </th>
                  )}
                  {activeTab === "expenses" && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(record.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {record.particular}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₱{parseFloat(record.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {activeTab === "collections" && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.control_number || "-"}
                      </td>
                    )}
                    {activeTab === "expenses" && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.category || "-"}
                        {record.subcategory && <div className="text-xs text-gray-400">{record.subcategory}</div>}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditRecord(record)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialRecordsManagerNew;