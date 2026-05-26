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
  AlertCircle,
  X,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in
          ${notification.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}
        >
          {notification.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">User Management</h2>
            <p className="text-xs text-slate-500 mt-0.5">{users.length} registered users</p>
          </div>
          {(user.role === "super_admin" || user.role === "admin") && (
            <button
              onClick={handleAddUser}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingUser ? "Edit User" : "Add User"}
              </h2>
              <button
                onClick={() => { setShowAddForm(false); resetForm(); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3 py-2 text-sm border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                      errors.email ? "border-red-300" : "border-slate-200"
                    }`}
                    placeholder="user@gmail.com"
                    disabled={editingUser}
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-3 py-2 text-sm border rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                      errors.name ? "border-red-300" : "border-slate-200"
                    }`}
                    placeholder="Full Name"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    disabled={user.role !== "super_admin" && formData.role === "admin"}
                  >
                    <option value="user">User</option>
                    {user.role === "super_admin" && <option value="admin">Admin</option>}
                  </select>
                  {user.role !== "super_admin" && (
                    <p className="mt-1 text-xs text-slate-500">
                      Only super admins can create admin users
                    </p>
                  )}
                </div>

                {editingUser && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    >
                      <option value={true}>Active</option>
                      <option value={false}>Disabled</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); resetForm(); }}
                  className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  {loading ? "Saving..." : editingUser ? "Save Changes" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="p-6">
        {loading && !showAddForm ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-slate-600">Loading users...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Login</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.profile_picture ? (
                            <img
                              className="w-7 h-7 rounded-full flex-shrink-0"
                              src={u.profile_picture}
                              alt={u.name}
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-800">{u.name}</p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
                          ${u.role === "super_admin" ? "bg-purple-50 text-purple-700" :
                            u.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}
                        >
                          {u.role === "super_admin" ? <Crown className="w-3 h-3" /> :
                            u.role === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
                          ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canManageUser(u) && (
                            <>
                              <button
                                onClick={() => handleEditUser(u)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                title="Edit user"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleUserStatus(u)}
                                className={`p-1.5 rounded-lg transition ${
                                  u.is_active
                                    ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                    : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                                title={u.is_active ? "Disable user" : "Enable user"}
                              >
                                {u.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                          {canDeleteUser(u) && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                        No users found.
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

export default UserManagement;