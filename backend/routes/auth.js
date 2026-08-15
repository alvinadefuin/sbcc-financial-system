const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const googleAuthService = require("../services/googleAuth");
const { authenticateToken, requireRole, checkRole, JWT_SECRET } = require("../middleware/auth");
const { logActivity, ACTIONS } = require("../../api/_lib/activityLog");
const router = express.Router();

// Kept in step with api/auth.js — both servers must lock on the same threshold.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;

// Login route
router.post("/login", (req, res) => {
  const { email, password, pwa } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  req.db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) {
      console.error('Login database error:', err);
      console.error('Query email:', email);
      return res.status(500).json({ error: "Database error", details: err.message });
    }

    // Before bcrypt, deliberately: answering after the password check would make
    // a locked account with the right password distinguishable from one with the
    // wrong password.
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: "Account temporarily locked after repeated failed sign-ins. Try again shortly.",
        retry_after_seconds: retryAfter,
      });
    }

    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const locking = attempts >= MAX_FAILED_LOGINS;
        try {
          await req.db.withTransaction(async (tx) => {
            if (locking) {
              await tx.run(
                `UPDATE users SET failed_login_attempts = ?,
                   locked_until = now() + (? || ' minutes')::interval
                 WHERE id = ?`,
                [attempts, String(LOCKOUT_MINUTES), user.id]
              );
            } else {
              await tx.run("UPDATE users SET failed_login_attempts = ? WHERE id = ?", [attempts, user.id]);
            }
          });
        } catch (lockErr) {
          console.error("Failed to record a failed sign-in:", lockErr.message);
        }
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: "Account is disabled" });
    }

    // Update last login, and clear the failure counter now that they are in.
    try {
      await req.db.withTransaction(async (tx) => {
        await tx.run(
          `UPDATE users SET last_login = CURRENT_TIMESTAMP,
             failed_login_attempts = 0, locked_until = NULL
           WHERE id = ?`,
          [user.id]
        );
      });
    } catch (resetErr) {
      console.error("Failed to reset the sign-in counter:", resetErr.message);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: user.token_version ?? 0 },
      JWT_SECRET,
      { expiresIn: pwa ? "7d" : "24h" }
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
// authenticateToken rather than a private jwt.verify: the frontend calls this on
// every page load to restore the session, so a revoked token accepted here would
// keep someone looking signed in while every other request failed.
router.get("/me", authenticateToken, (req, res) => {
  req.db.get(
    "SELECT id, email, name, role, profile_picture, is_active FROM users WHERE id = ?",
    [req.user.id],
    (err, userData) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }
      res.json(userData);
    }
  );
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
                { id: existingUser.id, email: existingUser.email, role: existingUser.role, name: googleUser.name, tv: existingUser.token_version ?? 0 },
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
// Role-based middleware
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

    // Only a super_admin may grant the role. Refusing explicitly here is what
    // lets the update builder below stop silently dropping the change.
    if (role === "super_admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Only super administrators can grant super admin" });
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
    if (role !== undefined) {
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

    // Refuse any change that would leave the system with no active super admin.
    // The count runs inside the transaction with FOR UPDATE, so two concurrent
    // demotions cannot both read "there are still two of us" and both proceed.
    const isDemotion = role !== undefined && role !== "super_admin" && user.role === "super_admin";
    const isDeactivation = is_active === false && user.role === "super_admin";

    (async () => {
      try {
        await req.db.withTransaction(async (tx) => {
          if (isDemotion || isDeactivation) {
            const supers = await tx.all(
              "SELECT id FROM users WHERE role = 'super_admin' AND is_active = true FOR UPDATE"
            );
            if (supers.length <= 1) {
              const conflict = new Error("Cannot remove the last super admin. Promote another account first.");
              conflict.conflict = true;
              throw conflict;
            }
          }

          await tx.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
        });

        res.json({ message: "User updated successfully" });
      } catch (txErr) {
        if (txErr.conflict) {
          return res.status(409).json({ error: txErr.message });
        }
        console.error("Failed to update user:", txErr.message);
        res.status(500).json({ error: "Failed to update user" });
      }
    })();
  });
});

// POST /api/auth/change-password — any authenticated user, own account only.
// Mirrors api/auth.js so the feature works in local development too; without it
// the frontend's Change Password button 404s against this server.
router.post("/change-password", authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  req.db.get("SELECT * FROM users WHERE id = ?", [req.user.id], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.password_hash || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hash = bcrypt.hashSync(new_password, 10);

    try {
      await req.db.withTransaction(async (tx) => {
        await tx.run(
          `UPDATE users SET password_hash = ?, token_version = token_version + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [hash, user.id]
        );

        await logActivity(tx, {
          actor: req.user,
          action: ACTIONS.PASSWORD_CHANGE,
          entityType: 'user',
          entityId: user.id,
          summary: 'Changed their own password; other sessions signed out',
        });
      });
    } catch (txErr) {
      console.error("Password change error:", txErr.message);
      return res.status(500).json({ error: "Failed to change password" });
    }

    // The bump above retired the token that authorised this request.
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: (user.token_version ?? 0) + 1 },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ message: "Password changed successfully", token });
  });
});

// PUT /api/auth/users/:id/password — super administrators only.
router.put("/users/:id/password", authenticateToken, requireRole(["super_admin"]), (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password) {
    return res.status(400).json({ error: "New password is required" });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  req.db.get("SELECT id, email, role FROM users WHERE id = ?", [id], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    const hash = bcrypt.hashSync(new_password, 10);

    try {
      await req.db.withTransaction(async (tx) => {
        await tx.run(
          `UPDATE users SET password_hash = ?, token_version = token_version + 1,
             failed_login_attempts = 0, locked_until = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [hash, id]
        );

        await logActivity(tx, {
          actor: req.user,
          action: ACTIONS.PASSWORD_CHANGE,
          entityType: 'user',
          entityId: parseInt(id, 10),
          summary: `Reset the password for ${user.email}; their sessions were signed out`,
        });
      });
    } catch (txErr) {
      console.error("Password reset error:", txErr.message);
      return res.status(500).json({ error: "Failed to reset password" });
    }

    res.json({ message: "Password reset successfully" });
  });
});

// Delete user (super_admin only)
router.delete("/users/:id", authenticateToken, requireRole(["super_admin"]), (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  req.db.get("SELECT id, email, role FROM users WHERE id = ?", [id], (readErr, target) => {
    if (readErr) {
      return res.status(500).json({ error: "Failed to delete user" });
    }
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    // Reported as a conflict rather than the old 404, which read as though the
    // account did not exist and sent the caller looking for the wrong problem.
    if (target.role === "super_admin") {
      return res.status(409).json({
        error: "Cannot delete a super admin. Demote the account first, which is itself refused if it is the last one.",
      });
    }

    req.db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to delete user" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ message: "User deleted successfully" });
    });
  });
});

module.exports = router;
