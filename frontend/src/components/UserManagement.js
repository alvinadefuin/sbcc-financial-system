import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  Search,
  Shield,
  User,
  Crown,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import apiService from "../utils/api";

const UserManagement = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [notification, setNotification] = useState(null);

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    role: "user",
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersData = await apiService.getUsers();
      setUsers(usersData);
    } catch (error) {
      showNotification("Failed to load users", "error");
      console.error("Error loading users:", error);
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
      email: "",
      name: "",
      role: "user",
    });
    setErrors({});
    setEditingUser(null);
  };

  const handleAddUser = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleEditUser = (userToEdit) => {
    setFormData({
      email: userToEdit.email,
      name: userToEdit.name,
      role: userToEdit.role,
      is_active: userToEdit.is_active,
    });
    setEditingUser(userToEdit);
    setShowAddForm(true);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";
    
    if (!formData.name) newErrors.name = "Name is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      if (editingUser) {
        // Update existing user
        await apiService.updateUser(editingUser.id, {
          name: formData.name,
          role: formData.role,
          is_active: formData.is_active,
        });
        showNotification("User updated successfully");
      } else {
        // Add new user
        await apiService.createUser(formData);
        showNotification("User created successfully");
      }

      setShowAddForm(false);
      resetForm();
      loadUsers();
    } catch (error) {
      console.error("Error saving user:", error);
      showNotification(
        error.response?.data?.error || "Failed to save user",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (!window.confirm(`Are you sure you want to delete ${userToDelete.name}?`)) return;

    try {
      setLoading(true);
      await apiService.deleteUser(userToDelete.id);
      showNotification("User deleted successfully");
      loadUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      showNotification(
        error.response?.data?.error || "Failed to delete user",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userToToggle) => {
    try {
      setLoading(true);
      await apiService.updateUser(userToToggle.id, {
        is_active: !userToToggle.is_active,
      });
      showNotification(
        `User ${userToToggle.is_active ? "disabled" : "enabled"} successfully`
      );
      loadUsers();
    } catch (error) {
      console.error("Error toggling user status:", error);
      showNotification(
        error.response?.data?.error || "Failed to update user status",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case "super_admin":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRoleBadge = (role) => {
    const styles = {
      super_admin: "bg-yellow-100 text-yellow-800",
      admin: "bg-blue-100 text-blue-800",
      user: "bg-gray-100 text-gray-800",
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[role]}`}>
        {role.replace("_", " ").toUpperCase()}
      </span>
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canManageUser = (targetUser) => {
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && targetUser.role !== "super_admin") return true;
    return false;
  };

  const canDeleteUser = (targetUser) => {
    return user.role === "super_admin" && targetUser.role !== "super_admin";
  };

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
            <Users className="h-6 w-6 text-blue-600" />
            User Management
          </h2>
          {(user.role === "super_admin" || user.role === "admin") && (
            <button
              onClick={handleAddUser}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </button>
          )}
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search users..."
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
              {editingUser ? "Edit User" : "Add New User"}
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="user@gmail.com"
                disabled={editingUser} // Don't allow email changes
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? "border-red-300" : "border-gray-300"
                }`}
                placeholder="Full Name"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={user.role !== "super_admin" && formData.role === "admin"}
              >
                <option value="user">User</option>
                {user.role === "super_admin" && <option value="admin">Admin</option>}
              </select>
              {user.role !== "super_admin" && (
                <p className="mt-1 text-xs text-gray-500">
                  Only super admins can create admin users
                </p>
              )}
            </div>

            {editingUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={true}>Active</option>
                  <option value={false}>Disabled</option>
                </select>
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : editingUser ? "Update User" : "Create User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="p-6">
        {loading && !showAddForm ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? "No users match your search." : "No users created yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {u.profile_picture ? (
                          <img
                            className="h-8 w-8 rounded-full mr-3"
                            src={u.profile_picture}
                            alt={u.name}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                            <User className="h-4 w-4 text-gray-500" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{u.name}</div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(u.role)}
                        {getRoleBadge(u.role)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {canManageUser(u) && (
                          <>
                            <button
                              onClick={() => handleEditUser(u)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit user"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleUserStatus(u)}
                              className={`${
                                u.is_active
                                  ? "text-red-600 hover:text-red-900"
                                  : "text-green-600 hover:text-green-900"
                              }`}
                              title={u.is_active ? "Disable user" : "Enable user"}
                            >
                              {u.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </>
                        )}
                        {canDeleteUser(u) && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
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

export default UserManagement;