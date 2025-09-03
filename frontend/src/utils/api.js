import axios from "axios";

// Always use production API for Supabase data, or override with env var
const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.REACT_APP_USE_PRODUCTION_API === 'true' 
    ? 'https://sbcc-financial-system-production.up.railway.app'
    : process.env.NODE_ENV === 'production' 
      ? 'https://sbcc-financial-system-production.up.railway.app'
      : "http://localhost:3001");

class ApiService {
  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Add auth token to requests
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle response errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("authToken");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(email, password) {
    try {
      const response = await this.api.post("/api/auth/login", {
        email,
        password,
      });
      if (response.data.token) {
        localStorage.setItem("authToken", response.data.token);
      }
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || "Login failed");
    }
  }

  async getCurrentUser() {
    try {
      const response = await this.api.get("/api/auth/me");
      return response.data;
    } catch (error) {
      throw new Error("Failed to get user data");
    }
  }

  logout() {
    localStorage.removeItem("authToken");
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.api.get("/api/health");
      return response.data;
    } catch (error) {
      throw new Error("Backend is not responding");
    }
  }

  // Collections methods
  async getCollections(filters = {}) {
    try {
      const params = {};
      
      // Support new date range parameters
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      
      // Support legacy month/year parameters
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;

      const response = await this.api.get("/api/collections", { params });
      return response.data;
    } catch (error) {
      throw new Error("Failed to fetch collections");
    }
  }

  async addCollection(data) {
    try {
      const response = await this.api.post("/api/collections", data);
      return response.data;
    } catch (error) {
      throw new Error(
        error.response?.data?.error || "Failed to add collection"
      );
    }
  }

  // NEW: Update collection
  async updateCollection(id, data) {
    try {
      const response = await this.api.put(`/api/collections/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(
        error.response?.data?.error || "Failed to update collection"
      );
    }
  }

  // NEW: Delete collection
  async deleteCollection(id) {
    try {
      const response = await this.api.delete(`/api/collections/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(
        error.response?.data?.error || "Failed to delete collection"
      );
    }
  }

  // Expenses methods
  async getExpenses(filters = {}) {
    try {
      const params = {};
      
      // Support new date range parameters
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      
      // Support legacy month/year parameters
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;

      const response = await this.api.get("/api/expenses", { params });
      return response.data;
    } catch (error) {
      throw new Error("Failed to fetch expenses");
    }
  }

  async addExpense(data) {
    try {
      const response = await this.api.post("/api/expenses", data);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || "Failed to add expense");
    }
  }

  // NEW: Update expense
  async updateExpense(id, data) {
    try {
      const response = await this.api.put(`/api/expenses/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(
        error.response?.data?.error || "Failed to update expense"
      );
    }
  }

  // NEW: Delete expense
  async deleteExpense(id) {
    try {
      const response = await this.api.delete(`/api/expenses/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(
        error.response?.data?.error || "Failed to delete expense"
      );
    }
  }

  // Budget methods
  async getBudgetPlan(year) {
    try {
      const response = await this.api.get(`/api/budget/plan/${year}`);
      return response.data;
    } catch (error) {
      console.error("Error fetching budget plan:", error);
      throw error;
    }
  }

  async saveBudgetPlan(budgetData) {
    try {
      const response = await this.api.post("/api/budget/plan", budgetData);
      return response.data;
    } catch (error) {
      console.error("Error saving budget plan:", error);
      throw error;
    }
  }

  async getBudgetComparison(year, month = null) {
    try {
      const params = { month };
      const response = await this.api.get(`/api/budget/comparison/${year}`, { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching budget comparison:", error);
      throw error;
    }
  }

  async getAvailableBudget(year, category, subcategory = null) {
    try {
      const params = { subcategory };
      const response = await this.api.get(`/api/budget/available/${year}/${category}`, { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching available budget:", error);
      throw error;
    }
  }

  // Google OAuth methods
  async googleLogin(googleToken) {
    try {
      const response = await this.api.post("/api/auth/google", { googleToken });
      
      if (response.data.token) {
        localStorage.setItem("authToken", response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error("Google login error:", error);
      throw error;
    }
  }

  async getGoogleConfig() {
    try {
      const response = await this.api.get("/api/auth/google/config");
      return response.data;
    } catch (error) {
      console.error("Error fetching Google config:", error);
      throw error;
    }
  }

  // User management methods
  async getUsers() {
    try {
      const response = await this.api.get("/api/auth/users");
      return response.data;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      const response = await this.api.post("/api/auth/users", userData);
      return response.data;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id, userData) {
    try {
      const response = await this.api.put(`/api/auth/users/${id}`, userData);
      return response.data;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  async deleteUser(id) {
    try {
      const response = await this.api.delete(`/api/auth/users/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }

  // Fund allocation methods
  async getFundAllocationSummary(month = null, year = null) {
    try {
      const params = {};
      if (month) params.month = month;
      if (year) params.year = year;
      
      const response = await this.api.get("/api/collections/fund-allocation/summary", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching fund allocation summary:", error);
      throw error;
    }
  }

  async getDetailedCollectionsSummary(month = null, year = null) {
    try {
      const params = {};
      if (month) params.month = month;
      if (year) params.year = year;
      
      const response = await this.api.get("/api/collections/summary/detailed", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching detailed collections summary:", error);
      throw error;
    }
  }

}

const apiService = new ApiService();
export default apiService;
