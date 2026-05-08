const db = require("../config/db");

function normalizeString(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s.length ? s : "";
}

exports.createSampleRequest = async (req, res) => {
  try {
    const { name, phone, email, gender, dob, address, state, city, pincode } =
      req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        status: false,
        message: "name is required",
      });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({
        status: false,
        message: "phone is required",
      });
    }

    const result = await db.query(
      `INSERT INTO sample_requests
        (name, phone, email, gender, dob, address, state, city, pincode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        gender ? gender.trim() : null,
        dob || null,
        address ? address.trim() : null,
        state ? state.trim() : null,
        city ? city.trim() : null,
        pincode ? pincode.trim() : null,
      ],
    );

    return res.status(201).json({
      status: true,
      message: "Sample request created successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.updateSampleRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required",
      });
    }

    const { name, phone, email, gender, dob, address, state, city, pincode } =
      req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    const maybePush = (field, val, validator) => {
      if (val === undefined) return;
      if (validator) {
        const v = validator(val);
        if (v === undefined) return;
        val = v;
      }
      updates.push(`${field} = $${idx}`);
      values.push(val);
      idx++;
    };

    maybePush("name", name, (v) => {
      if (typeof v !== "string" || !v.trim()) {
        throw { status: 400, message: "name must be a non-empty string" };
      }
      return v.trim();
    });

    maybePush("phone", phone, (v) => {
      if (typeof v !== "string" || !v.trim()) {
        throw { status: 400, message: "phone must be a non-empty string" };
      }
      return v.trim();
    });

    maybePush("email", email, (v) => (v === null ? null : normalizeString(v)));
    maybePush("gender", gender, (v) =>
      v === null ? null : normalizeString(v),
    );
    maybePush("dob", dob, (v) => v || null);
    maybePush("address", address, (v) =>
      v === null ? null : normalizeString(v),
    );
    maybePush("state", state, (v) => (v === null ? null : normalizeString(v)));
    maybePush("city", city, (v) => (v === null ? null : normalizeString(v)));
    maybePush("pincode", pincode, (v) =>
      v === null ? null : normalizeString(v),
    );

    if (!updates.length) {
      return res.status(400).json({
        status: false,
        message: "No fields to update",
      });
    }

    values.push(parsedId);

    const query = `
      UPDATE sample_requests
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Sample request updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    if (err && err.status) {
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    }
    console.error(err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.getSampleRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        status: false,
        message: "Valid id is required",
      });
    }

    const result = await db.query(
      "SELECT * FROM sample_requests WHERE id = $1",
      [parsedId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ status: false, message: "Not found" });
    }

    return res.status(200).json({
      status: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

exports.listSampleRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    let where = "WHERE 1=1";

    if (search && typeof search === "string" && search.trim()) {
      where += ` AND (
        name ILIKE $${params.length + 1}
        OR phone ILIKE $${params.length + 1}
        OR email ILIKE $${params.length + 1}
        OR city ILIKE $${params.length + 1}
        OR state ILIKE $${params.length + 1}
      )`;
      params.push(`%${search.trim()}%`);
    }

    const dataQuery = `
      SELECT *
      FROM sample_requests
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limitNum, offset);

    const result = await db.query(dataQuery, params);

    const countParams = params.slice(0, params.length - 2);
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM sample_requests ${where}`,
      countParams,
    );

    const total = parseInt(countResult.rows[0].total || 0);

    return res.status(200).json({
      status: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
