import axios from "axios";

const API_BASE_URL = "http://localhost:3001";

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
  async getCollections(month = null, year = null) {
    try {
      const params = {};
      if (month) params.month = month;
      if (year) params.year = year;

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
  async getExpenses(month = null, year = null) {
    try {
      const params = {};
      if (month) params.month = month;
      if (year) params.year = year;

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
}

export default new ApiService();
