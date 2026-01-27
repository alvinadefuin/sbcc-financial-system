const db = require('../../_lib/database');
const { cors, requireRole } = require('../../_lib/auth');

module.exports = cors(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'PUT') {
    return requireRole(['super_admin', 'admin'], async (req, res) => {
      const { name, role, is_active } = req.body;

      try {
        const user = await db.get('SELECT * FROM users WHERE id = $1', [id]);

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
          return res.status(403).json({ error: 'Cannot modify super administrator accounts' });
        }

        if (role === 'admin' && req.user.role !== 'super_admin') {
          return res.status(403).json({ error: 'Only super administrators can grant admin privileges' });
        }

        if (user.email === req.user.email && is_active === false) {
          return res.status(400).json({ error: 'Cannot disable your own account' });
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(name);
        }
        if (role !== undefined && role !== 'super_admin') {
          updates.push(`role = $${paramIndex++}`);
          values.push(role);
        }
        if (is_active !== undefined) {
          updates.push(`is_active = $${paramIndex++}`);
          values.push(is_active);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        if (updates.length === 1) {
          return res.status(400).json({ error: 'No valid updates provided' });
        }

        await db.run(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );

        res.json({ message: 'User updated successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to update user' });
      }
    })(req, res);
  }

  if (req.method === 'DELETE') {
    return requireRole(['super_admin'], async (req, res) => {
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      try {
        const result = await db.run(
          "DELETE FROM users WHERE id = $1 AND role != 'super_admin'",
          [id]
        );

        if (result.changes === 0) {
          return res.status(404).json({ error: 'User not found or cannot be deleted' });
        }

        res.json({ message: 'User deleted successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
      }
    })(req, res);
  }

  res.status(405).end();
});
