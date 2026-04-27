const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const userController = require("./userController"); // Reuse user logic if needed

// GET /api/staff - List staff with user/role details
exports.getAllStaff = async (req, res) => {
  try {
    const { page = 1, limit = 10, department, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        s.id, s.department, s.designation, s.salary, s.hire_date, s.is_active,
        s.created_at as hire_time,
        u.id as user_id, u.username, u.full_name, u.email, u.phone, u.kyc_status,
        r.name as role_name, r.permissions
      FROM staff s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON s.role_id = r.id
      WHERE 1=1
    `;
    let params = [];

    if (department) {
      query += ` AND s.department ILIKE $${params.length + 1}`;
      params.push(`%${department}%`);
    }
    if (search) {
      query += ` AND (u.full_name ILIKE $${
        params.length + 1
      } OR u.username ILIKE $${params.length + 1})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(parseInt(limit), offset);

    const staff = await db.query(query, params);

    // Count for pagination
    const countQuery = `
      SELECT COUNT(s.id)::int as total
      FROM staff s ${
        department || search ? "JOIN users u ON s.user_id = u.id" : ""
      }
      ${department ? "WHERE s.department ILIKE $1" : ""} 
      ${search ? "AND (u.full_name ILIKE $1 OR u.username ILIKE $1)" : ""}
    `;
    const countParams = department
      ? [`%${department}%`]
      : search
      ? [`%${search}%`]
      : [];
    const countResult = await db.query(countQuery, countParams);

    res.json({
      status: true,
      data: staff.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        total_pages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// POST /api/staff - Create staff (creates user if needed)
exports.createStaff = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const {
      full_name,
      email,
      phone,
      password,
      role_id,
      department,
      designation,
      salary,
      hire_date,
      manager_id,
    } = req.body;

    if (!full_name || !email || !phone || !password || !role_id) {
      throw new Error("Missing required fields");
    }

    let userRes = await client.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [email, phone],
    );

    let userId;
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
      await client.query("UPDATE users SET role_id = $1 WHERE id = $2", [
        role_id,
        userId,
      ]);
    } else {
      // 1. Generate a random Username and Referral Code to satisfy NOT NULL constraints
      const username = `staff_${crypto.randomBytes(3).toString("hex")}`;
      const referral_code = `REF_${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;
      const hashedPassword = await bcrypt.hash(password, 10);

      // 2. Added referral_code to the INSERT statement
      const newUser = await client.query(
        `INSERT INTO users (
            username, 
            full_name, 
            email, 
            phone, 
            password_hash, 
            role_id, 
            referral_code, 
            is_active,
            kyc_status
         ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true) RETURNING id`,
        [
          username,
          full_name,
          email,
          phone,
          hashedPassword,
          role_id,
          referral_code,
        ],
      );
      userId = newUser.rows[0].id;
    }

    const staffResult = await client.query(
      `INSERT INTO staff (user_id, role_id, department, designation, salary, hire_date, manager_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        role_id,
        department,
        designation,
        salary || 0,
        hire_date || new Date().toISOString().split("T")[0],
        manager_id || null,
      ],
    );

    await client.query("COMMIT");
    res.status(201).json({ status: true, data: staffResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Staff Creation Error:", err.message);
    res.status(400).json({ status: false, error: err.message });
  } finally {
    client.release();
  }
};

// PUT /api/staff/:id - Update staff
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body; // department, salary, role_id, etc.

    const allowedFields = [
      "department",
      "designation",
      "salary",
      "hire_date",
      "manager_id",
      "role_id",
      "is_active",
    ];
    const updateFields = Object.keys(updates).filter((key) =>
      allowedFields.includes(key),
    );

    if (updateFields.length === 0) {
      return res
        .status(400)
        .json({ status: false, error: "No valid fields to update" });
    }

    let setClause = updateFields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(", ");
    const values = updateFields.map((field) => updates[field]);
    values.push(id);

    const result = await db.query(
      `UPDATE staff 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${values.length} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Staff not found" });
    }

    res.json({ status: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// DELETE /api/staff/:id - Deactivate staff
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "UPDATE staff SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Staff not found" });
    }

    res.json({ status: true, message: "Staff deactivated statusfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// GET /api/staff/:id - Get single staff
exports.getStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    const staff = await db.query(
      `
      SELECT 
        s.*, u.username, u.email, u.phone, u.full_name,
        r.name as role_name
      FROM staff s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON s.role_id = r.id
      WHERE s.id = $1
    `,
      [id],
    );

    if (staff.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Staff not found" });
    }

    res.json({ status: true, data: staff.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};
