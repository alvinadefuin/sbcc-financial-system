import React, { useState, useEffect } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Save,
  X,
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

      let total = parseValue(data.general_tithes_offering) +
             parseValue(data.bank_interest) +
             parseValue(data.sisterhood_san_juan) +
             parseValue(data.sisterhood_labuin) +
             parseValue(data.brotherhood) +
             parseValue(data.youth) +
             parseValue(data.couples) +
             parseValue(data.sunday_school) +
             parseValue(data.special_purpose_pledge);

      // Add custom decimal fields to total (only 'main' category fields)
      if (data.custom_fields && customFields.length > 0) {
        customFields.forEach(field => {
          if (field.field_type === 'decimal' && field.category === 'main') {
            total += parseValue(data.custom_fields[field.field_name]);
          }
        });
      }

      return total;
    } else if (recordType === "expenses") {
      // Parse both formatted (with commas) and unformatted numbers
      const parseValue = (value) => {
        if (!value || value === "") return 0;
        // Remove commas and parse as float
        return parseFloat(value.toString().replace(/,/g, '')) || 0;
      };

      // Calculate total from new expense fields
      let total = parseValue(data.pbcm_share_pdot) + parseValue(data.pastoral_team);
      
      // Add operational fund entries
      operationalFundEntries.forEach(entry => {
        total += parseValue(entry.amount);
      });
      
      return total;
    } else {
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

  // Handle custom field changes
  const handleCustomFieldChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      custom_fields: {
        ...prev.custom_fields,
        [fieldName]: value
      }
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
  const [customFields, setCustomFields] = useState([]);
  const [, setLoadingFields] = useState(false);

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
    // New operational fund entries
    pbcm_share_pdot: "",
    pastoral_team: "",
    // Custom fields
    custom_fields: {}
  });

  // State for multiple operational fund entries
  const [operationalFundEntries, setOperationalFundEntries] = useState([
    { category: '', amount: '' }
  ]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Collection fields
    formData.general_tithes_offering, formData.bank_interest, formData.sisterhood_san_juan,
    formData.sisterhood_labuin, formData.brotherhood, formData.youth, formData.couples,
    formData.sunday_school, formData.special_purpose_pledge,
    // New expense fields
    formData.pbcm_share_pdot, formData.pastoral_team,
    // Custom fields
    formData.custom_fields,
    activeTab, operationalFundEntries
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Load custom fields when tab changes
  useEffect(() => {
    loadCustomFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadCustomFields = async () => {
    try {
      setLoadingFields(true);
      const fields = await apiService.getCustomFields(activeTab);
      setCustomFields(fields);

      // Initialize custom fields in formData with default values
      const customFieldsInit = {};
      fields.forEach(field => {
        customFieldsInit[field.field_name] = field.default_value || '';
      });

      setFormData(prev => ({
        ...prev,
        custom_fields: customFieldsInit
      }));
    } catch (error) {
      console.error('Error loading custom fields:', error);
    } finally {
      setLoadingFields(false);
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
      pbcm_share_pdot: "",
      pastoral_team: "",
      custom_fields: {}
    });
    setOperationalFundEntries([{ category: '', amount: '' }]);
    setErrors({});
    setEditingRecord(null);
    // Reload custom fields with default values
    loadCustomFields();
  };

  // Render input based on custom field type
  const renderCustomFieldInput = (field) => {
    const value = formData.custom_fields[field.field_name] || '';

    switch (field.field_type) {
      case 'decimal':
      case 'integer':
        return (
          <input
            type="number"
            step={field.field_type === 'decimal' ? '0.01' : '1'}
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            placeholder={`Enter ${field.field_label}`}
            required={!!field.is_required}
          />
        );

      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            placeholder={`Enter ${field.field_label}`}
            required={!!field.is_required}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            required={!!field.is_required}
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={value === true || value === 'true'}
              onChange={(e) => handleCustomFieldChange(field.field_name, e.target.checked)}
              className="h-4 w-4 text-blue-600"
            />
            <label className="ml-2 text-xs font-medium text-slate-500">
              {field.field_label}
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  const handleAddRecord = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleEditRecord = (record) => {
    // Map database fields to form fields for expenses
    const mappedRecord = { ...record };
    if (activeTab === 'expenses') {
      // Map pbcm_share_expense to pbcm_share_pdot for the form
      mappedRecord.pbcm_share_pdot = record.pbcm_share_expense || record.pbcm_share_pdot || '';
      // Map pastoral_worker_support to pastoral_team for the form
      mappedRecord.pastoral_team = record.pastoral_worker_support || record.pastoral_team || '';
      
      // Extract operational fund entries from various expense categories
      const operationalEntries = [];

      // Check all operational fund categories
      if (record.conference_seminar > 0) {
        operationalEntries.push({ category: 'Conference/Seminar/Retreat/Assembly', amount: record.conference_seminar });
      }
      if (record.fellowship_events > 0) {
        operationalEntries.push({ category: 'Fellowship Events', amount: record.fellowship_events });
      }
      if (record.utilities > 0) {
        operationalEntries.push({ category: 'Utilities', amount: record.utilities });
      }
      if (record.honorarium > 0) {
        operationalEntries.push({ category: 'Honorarium', amount: record.honorarium });
      }
      if (record.building_maintenance > 0) {
        operationalEntries.push({ category: 'Building Maintenance', amount: record.building_maintenance });
      }
      if (record.supplies > 0) {
        operationalEntries.push({ category: 'Supplies', amount: record.supplies });
      }
      if (record.transportation_gas > 0) {
        operationalEntries.push({ category: 'Transportation & Gas', amount: record.transportation_gas });
      }
      if (record.vehicle_maintenance > 0) {
        operationalEntries.push({ category: 'Vehicle Maintenance', amount: record.vehicle_maintenance });
      }
      if (record.lto_registration > 0) {
        operationalEntries.push({ category: 'LTO Registration', amount: record.lto_registration });
      }
      if (record.cbcc_share > 0) {
        operationalEntries.push({ category: 'CBCC Share', amount: record.cbcc_share });
      }
      if (record.anniversary_christmas > 0) {
        operationalEntries.push({ category: 'Anniversary/Christmas Events', amount: record.anniversary_christmas });
      }
      if (record.cap_assistance > 0) {
        operationalEntries.push({ category: 'CAP-Churches Assistance Program', amount: record.cap_assistance });
      }
      if (record.abccop_national > 0) {
        operationalEntries.push({ category: 'ABCCOP National', amount: record.abccop_national });
      }
      if (record.kabalikat_share > 0) {
        operationalEntries.push({ category: 'Kabalikat Share', amount: record.kabalikat_share });
      }
      if (record.abccop_community > 0) {
        operationalEntries.push({ category: 'ABCCOP Community Day', amount: record.abccop_community });
      }
      
      // Set operational fund entries if any were found
      if (operationalEntries.length > 0) {
        setOperationalFundEntries(operationalEntries);
      } else {
        setOperationalFundEntries([{ category: '', amount: '' }]);
      }
    }

    // Include custom fields from record if they exist
    setFormData({
      ...mappedRecord,
      custom_fields: record.custom_fields || {}
    });
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

    // No category validation needed since we use individual fields now

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
        'sisterhood_labuin', 'brotherhood', 'youth', 'couples', 'sunday_school', 'special_purpose_pledge',
        'pbcm_share_pdot', 'pastoral_team'
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

      // Add operational fund entries for expenses
      if (activeTab === "expenses") {
        // Add operational fund entries
        operationalFundEntries.forEach((entry, index) => {
          if (entry.category && entry.amount) {
            submitData[`operational_fund_${index + 1}`] = entry.category;
            submitData[`operational_fund_${index + 1}_amount`] = parseCurrency(entry.amount);
          }
        });
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
    <div className="bg-slate-50">
      {/* Notification */}
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

      {/* Tab bar */}
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
            onClick={handleAddRecord}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition mb-1"
          >
            <Plus className="w-4 h-4" />
            Add {activeTab === "collections" ? "Collection" : "Expense"}
          </button>
        </div>
      </div>

      {/* Search/filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 px-6">
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
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-2 border border-slate-200 rounded-lg transition"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingRecord ? "Edit Record" : `Add ${activeTab === "collections" ? "Collection" : "Expense"}`}
              </h2>
              <button
                onClick={() => { setShowAddForm(false); setEditingRecord(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Basic Fields */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className={`w-full px-3 py-2 text-sm border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.date ? "border-rose-400" : "border-slate-200"
                }`}
              />
              {errors.date && <p className="mt-1 text-xs text-rose-600">{errors.date}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.particular}
                onChange={(e) => setFormData({ ...formData, particular: e.target.value })}
                className={`w-full px-3 py-2 text-sm border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.particular ? "border-rose-400" : "border-slate-200"
                }`}
                placeholder="Enter description"
              />
              {errors.particular && <p className="mt-1 text-xs text-rose-600">{errors.particular}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Total Amount
              </label>
              <input
                type="text"
                value={formData.total_amount}
                onChange={(e) => handleCurrencyInput('total_amount', e.target.value)}
                onBlur={(e) => handleCurrencyBlur('total_amount', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                  errors.total_amount ? "border-rose-400" : "border-slate-200"
                }`}
                placeholder="30,188.00"
              />
              {errors.total_amount && <p className="mt-1 text-xs text-rose-600">{errors.total_amount}</p>}
            </div>

            {/* Collection-specific fields */}
            {activeTab === "collections" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Control Number
                  </label>
                  <input
                    type="text"
                    value={formData.control_number}
                    onChange={(e) => setFormData({ ...formData, control_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    General Tithes & Offering
                  </label>
                  <input
                    type="text"
                    value={formData.general_tithes_offering}
                    onChange={(e) => handleCurrencyInput('general_tithes_offering', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('general_tithes_offering', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="30,123.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Sisterhood San Juan
                  </label>
                  <input
                    type="text"
                    value={formData.sisterhood_san_juan}
                    onChange={(e) => handleCurrencyInput('sisterhood_san_juan', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sisterhood_san_juan', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Sisterhood Labuin
                  </label>
                  <input
                    type="text"
                    value={formData.sisterhood_labuin}
                    onChange={(e) => handleCurrencyInput('sisterhood_labuin', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sisterhood_labuin', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Youth
                  </label>
                  <input
                    type="text"
                    value={formData.youth}
                    onChange={(e) => handleCurrencyInput('youth', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('youth', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Sunday School
                  </label>
                  <input
                    type="text"
                    value={formData.sunday_school}
                    onChange={(e) => handleCurrencyInput('sunday_school', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('sunday_school', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>
              </>
            )}

            {/* Expense-specific fields */}
            {activeTab === "expenses" && (
              <>
                {/* PBCM Share/PDOT */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    PBCM Share/PDOT
                  </label>
                  <input
                    type="text"
                    value={formData.pbcm_share_pdot}
                    onChange={(e) => handleCurrencyInput('pbcm_share_pdot', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('pbcm_share_pdot', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>

                {/* Pastoral Team */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Pastoral Team
                  </label>
                  <input
                    type="text"
                    value={formData.pastoral_team}
                    onChange={(e) => handleCurrencyInput('pastoral_team', e.target.value)}
                    onBlur={(e) => handleCurrencyBlur('pastoral_team', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
                </div>

                {/* Dynamic Operational Fund Entries */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-slate-500">
                      Operational Fund Categories
                    </label>
                    <button
                      type="button"
                      onClick={() => setOperationalFundEntries([...operationalFundEntries, { category: '', amount: '' }])}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                  {operationalFundEntries.map((entry, index) => (
                    <div key={index} className="flex gap-3 mb-3 items-end">
                      <div className="flex-1">
                        <select
                          value={entry.category}
                          onChange={(e) => {
                            const updatedEntries = [...operationalFundEntries];
                            updatedEntries[index].category = e.target.value;
                            setOperationalFundEntries(updatedEntries);
                          }}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        >
                          <option value="">Choose category</option>
                          {operationalSubcategories.map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={entry.amount}
                          onChange={(e) => {
                            const cleanValue = e.target.value.replace(/[^\d.]/g, '');
                            const updatedEntries = [...operationalFundEntries];
                            updatedEntries[index].amount = cleanValue;
                            setOperationalFundEntries(updatedEntries);
                          }}
                          onBlur={(e) => {
                            const numValue = parseFloat(e.target.value) || 0;
                            const updatedEntries = [...operationalFundEntries];
                            updatedEntries[index].amount = numValue > 0 ? formatCurrency(numValue) : "";
                            setOperationalFundEntries(updatedEntries);
                          }}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                          placeholder="0.00"
                        />
                      </div>
                      {operationalFundEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updatedEntries = operationalFundEntries.filter((_, i) => i !== index);
                            setOperationalFundEntries(updatedEntries);
                          }}
                          className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Forms Number
                  </label>
                  <input
                    type="text"
                    value={formData.forms_number}
                    onChange={(e) => setFormData({ ...formData, forms_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Cheque Number
                  </label>
                  <input
                    type="text"
                    value={formData.cheque_number}
                    onChange={(e) => setFormData({ ...formData, cheque_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Optional"
                  />
                </div>
              </>
            )}

            {/* Custom Fields Section */}
            {customFields.length > 0 && (
              <>
                <div className="col-span-2 mt-4 pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Custom Fields
                  </h3>
                </div>

                {customFields
                  .filter(field => !!field.is_active)
                  .map((field) => (
                    <div key={field.id}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {field.field_label}
                        {!!field.is_required && (
                          <span className="text-rose-500 ml-1">*</span>
                        )}
                      </label>
                      {renderCustomFieldInput(field)}
                      {field.description && (
                        <p className="text-xs text-slate-400 mt-1">
                          {field.description}
                        </p>
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>

            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setEditingRecord(null); resetForm(); }}
                className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Saving..." : editingRecord ? "Save Changes" : "Add Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="px-6 pb-6">
        {loading && !showAddForm ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-slate-500">Loading records...</p>
          </div>
        ) : (
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
                  {filteredData.length > 0 ? filteredData.map((record, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(record.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {activeTab === "collections" ? (record.control_number || "-") : (record.forms_number || "-")}
                      </td>
                      <td className="px-4 py-3 text-slate-800 max-w-[200px] truncate">{record.particular}</td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap
                        ${activeTab === "collections" ? "text-emerald-600" : "text-rose-600"}`}>
                        ₱{formatCurrency(record.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditRecord(record)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.id)}
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
                        {searchTerm ? "No records match your filters." : "No records yet. Add your first entry."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialRecordsManagerNew;