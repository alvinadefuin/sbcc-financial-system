const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const googleAuthService = require("../services/googleAuth");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

// Login route
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  req.db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err) {
      console.error('Login database error:', err);
      console.error('Query email:', email);
      return res.status(500).json({ error: "Database error", details: err.message });
    }

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: "Account is disabled" });
    }

    // Update last login
    req.db.run(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profile_picture: user.profile_picture,
      },
    });
  });
});

// Get current user
router.get("/me", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }

    req.db.get(
      "SELECT id, email, name, role, profile_picture, is_active FROM users WHERE id = ?",
      [user.id],
      (err, userData) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }
        res.json(userData);
      }
    );
  });
});

// Google OAuth login
router.post("/google", async (req, res) => {
  const { googleToken } = req.body;

  if (!googleToken) {
    return res.status(400).json({ error: "Google token is required" });
  }

  try {
    // Verify Google token
    const googleUser = await googleAuthService.verifyGoogleToken(googleToken);
    
    // Check if user exists
    req.db.get(
      "SELECT * FROM users WHERE email = ? OR google_id = ?",
      [googleUser.email, googleUser.googleId],
      (err, existingUser) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existingUser) {
          // Update existing user
          if (!existingUser.is_active) {
            return res.status(401).json({ error: "Account is disabled" });
          }

          req.db.run(
            `UPDATE users SET 
             google_id = ?, name = ?, profile_picture = ?, 
             last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [googleUser.googleId, googleUser.name, googleUser.profilePicture, existingUser.id],
            (updateErr) => {
              if (updateErr) {
                return res.status(500).json({ error: "Failed to update user" });
              }

              const token = jwt.sign(
                { id: existingUser.id, email: existingUser.email, role: existingUser.role, name: googleUser.name },
                JWT_SECRET,
                { expiresIn: "24h" }
              );

              res.json({
                token,
                user: {
                  id: existingUser.id,
                  email: existingUser.email,
                  name: googleUser.name,
                  role: existingUser.role,
                  profile_picture: googleUser.profilePicture,
                },
              });
            }
          );
        } else {
          // New user - only allow if they're from an approved domain or manually approved
          return res.status(403).json({ 
            error: "Access denied. Please contact an administrator to get access.",
            email: googleUser.email 
          });
        }
      }
    );
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Get Google Client ID for frontend
router.get("/google/config", (req, res) => {
  res.json({
    clientId: googleAuthService.getClientId(),
    configured: googleAuthService.isConfigured(),
  });
});

// Auth middleware for protected routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Role-based middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    
    next();
  };
};

// Get all users (admin only)
router.get("/users", authenticateToken, requireRole(["super_admin", "admin"]), (req, res) => {
  req.db.all(
    "SELECT id, email, name, role, profile_picture, is_active, last_login, created_at, created_by FROM users ORDER BY created_at DESC",
    [],
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }
      res.json(users);
    }
  );
});

// Create new user (admin only)
router.post("/users", authenticateToken, requireRole(["super_admin", "admin"]), (req, res) => {
  const { email, name, role = "user" } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }

  // Only super_admin can create admin users
  if (role === "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Only super administrators can create admin users" });
  }

  // No one can create super_admin except through direct database access
  if (role === "super_admin") {
    return res.status(403).json({ error: "Cannot create super admin users through API" });
  }

  req.db.run(
    "INSERT INTO users (email, name, role, created_by) VALUES (?, ?, ?, ?)",
    [email, name, role, req.user.email],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({ error: "User with this email already exists" });
        }
        return res.status(500).json({ error: "Failed to create user" });
      }

      res.json({
        id: this.lastID,
        message: "User created successfully",
        email,
        name,
        role,
      });
    }
  );
});

// Update user (admin only)
router.put("/users/:id", authenticateToken, requireRole(["super_admin", "admin"]), (req, res) => {
  const { id } = req.params;
  const { name, role, is_active } = req.body;

  // Get current user data to check permissions
  req.db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent users from modifying super_admin accounts (except by super_admin)
    if (user.role === "super_admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Cannot modify super administrator accounts" });
    }

    // Only super_admin can promote to admin
    if (role === "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Only super administrators can grant admin privileges" });
    }

    // Prevent self-disabling
    if (user.email === req.user.email && is_active === false) {
      return res.status(400).json({ error: "Cannot disable your own account" });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (role !== undefined && role !== "super_admin") {
      updates.push("role = ?");
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    if (updates.length === 1) {
      return res.status(400).json({ error: "No valid updates provided" });
    }

    req.db.run(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to update user" });
        }

        res.json({ message: "User updated successfully" });
      }
    );
  });
});

// Delete user (super_admin only)
router.delete("/users/:id", authenticateToken, requireRole(["super_admin"]), (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  req.db.run("DELETE FROM users WHERE id = ? AND role != 'super_admin'", [id], function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to delete user" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "User not found or cannot be deleted" });
    }

    res.json({ message: "User deleted successfully" });
  });
});

module.exports = router;
