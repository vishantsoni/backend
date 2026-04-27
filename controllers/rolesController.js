const db = require("../config/db");

// GET /api/roles - List all roles
exports.getAllRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, name, permissions, description, is_active, created_at 
      FROM roles 
      WHERE 1=1
    `;
    let countQuery = `SELECT COUNT(*) FROM roles WHERE 1=1`;
    let params = [],
      countParams = [];

    if (search) {
      query += ` AND (name ILIKE $1 OR description ILIKE $1)`;
      countQuery += ` AND (name ILIKE $1 OR description ILIKE $1)`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY name LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(parseInt(limit), offset);

    const [roles, { count }] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    res.json({
      status: true,
      data: roles.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        // total: parseInt(count.rows[0].count),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// POST /api/roles - Create role
exports.createRole = async (req, res) => {
  try {
    const { name, permissions = [], description } = req.body;

    if (!name || !Array.isArray(permissions)) {
      return res
        .status(400)
        .json({ status: false, error: "Name and permissions array required" });
    }

    const existing = await db.query("SELECT id FROM roles WHERE name = $1", [
      name,
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ status: false, error: "Role name exists" });
    }

    const result = await db.query(
      "INSERT INTO roles (name, permissions, description) VALUES ($1, $2, $3) RETURNING *",
      [name, JSON.stringify(permissions), description || null],
    );

    res.status(201).json({ status: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// PUT /api/roles/:id - Update role
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions = [], description, is_active } = req.body;

    if (!Array.isArray(permissions)) {
      return res
        .status(400)
        .json({ status: false, error: "Permissions must be array" });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    if (permissions.length >= 0) {
      updates.push(`permissions = $${paramIndex}::JSONB`);
      values.push(JSON.stringify(permissions));
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ status: false, error: "No fields to update" });
    }

    values.push(id);

    const result = await db.query(
      `UPDATE roles SET ${updates.join(", ")} 
       WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Role not found" });
    }

    res.json({ status: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// DELETE /api/roles/:id - Delete role
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if used by users/staff
    const usage = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE role_id = $1 
       UNION ALL 
       SELECT COUNT(*) as count FROM staff WHERE role_id = $1`,
      [id],
    );
    const totalUsage = usage.rows.reduce(
      (sum, row) => sum + parseInt(row.count),
      0,
    );
    if (totalUsage > 0) {
      return res.status(409).json({
        status: false,
        error: `Role used by ${totalUsage} records. Unassign first.`,
      });
    }

    const result = await db.query(
      "DELETE FROM roles WHERE id = $1 RETURNING id",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Role not found" });
    }

    res.json({ status: true, message: "Role deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// GET /api/roles/:id/permissions - Get role permissions
exports.getRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.query("SELECT permissions FROM roles WHERE id = $1", [
      id,
    ]);
    if (role.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Role not found" });
    }
    res.json({ status: true, permissions: role.rows[0].permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};
