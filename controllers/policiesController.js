const db = require("../config/db");
const fs = require("fs/promises");
const path = require("path");

function sanitizeFileName(name) {
  return String(name)
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function buildPublicUrl(fileUrlPath) {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!appUrl) return fileUrlPath;
  // fileUrlPath should NOT start with appUrl.
  return `${appUrl}${fileUrlPath.startsWith("/") ? "" : "/"}${fileUrlPath}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function savePdfFile({ file, policyId }) {
  const uploadDir = path.join(process.cwd(), "uploads", "docs", "policies");
  await ensureDir(uploadDir);

  const original = file.originalname || "policy.pdf";
  const baseName = sanitizeFileName(original) || "policy";
  const fileName = `${policyId}_${Date.now()}_${baseName}.pdf`;
  const filePath = path.join(uploadDir, fileName);

  await fs.writeFile(filePath, file.buffer);

  // This corresponds to express static: app.use('/uploads', express.static('uploads'))
  const publicPath = `/uploads/docs/policies/${fileName}`;
  const fileUrl = buildPublicUrl(publicPath);

  return { fileUrl, filePath };
}

async function removeExistingFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // ignore missing file
  }
}

exports.uploadPolicy = async (req, res) => {
  try {
    const { title, version, is_active } = req.body;
    const pdfFile = req.file;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "title is required" });
    }

    if (!pdfFile) {
      return res
        .status(400)
        .json({ success: false, message: "pdf is required" });
    }

    // Create row first to get id for deterministic filename.
    const inserted = await db.query(
      `INSERT INTO policies (title, version, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING *`,
      [
        title.trim(),
        version || null,
        is_active !== undefined ? is_active : true,
      ],
    );

    const policy = inserted.rows[0];
    const { fileUrl, filePath } = await savePdfFile({
      file: pdfFile,
      policyId: policy.id,
    });

    const updated = await db.query(
      `UPDATE policies
       SET file_url = $1,
           file_path = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [fileUrl, filePath, policy.id],
    );

    // If is_active=true, optionally deactivate others.
    if (policy.is_active === true || String(policy.is_active) === "true") {
      await db.query(
        `UPDATE policies SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id <> $1`,
        [policy.id],
      );
      const activeUpdated = await db.query(
        `SELECT * FROM policies WHERE id = $1`,
        [policy.id],
      );
      updated.rows[0].is_active = activeUpdated.rows[0].is_active;
    }

    res.status(201).json({
      success: true,
      message: "Policy uploaded successfully",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error("uploadPolicy error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.listPolicies = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM policies`;
    const params = [];

    if (status === "active") {
      query += ` WHERE is_active = true`;
    } else if (status === "inactive") {
      query += ` WHERE is_active = false`;
    }

    query += ` ORDER BY updated_at DESC NULLS LAST, created_at DESC`;

    const result = await db.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("listPolicies error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getPolicyById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT * FROM policies WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Policy not found" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("getPolicyById error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, version, is_active } = req.body;
    const pdfFile = req.file;

    const currentRes = await db.query(`SELECT * FROM policies WHERE id = $1`, [
      id,
    ]);
    if (currentRes.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Policy not found" });
    }

    const current = currentRes.rows[0];

    let newFileUrl = current.file_url;
    let newFilePath = current.file_path;

    if (pdfFile) {
      // replace file
      const { fileUrl, filePath } = await savePdfFile({
        file: pdfFile,
        policyId: id,
      });
      newFileUrl = fileUrl;
      newFilePath = filePath;

      // remove old file
      await removeExistingFile(current.file_path);
    }

    const updatedRes = await db.query(
      `UPDATE policies
       SET title = COALESCE($1, title),
           version = COALESCE($2, version),
           is_active = COALESCE($3, is_active),
           file_url = $4,
           file_path = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        title ? title.trim() : null,
        version ?? null,
        is_active,
        newFileUrl,
        newFilePath,
        id,
      ],
    );

    // If turning active=true, deactivate others
    const updated = updatedRes.rows[0];
    if (updated.is_active === true || String(updated.is_active) === "true") {
      await db.query(
        `UPDATE policies SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id <> $1`,
        [updated.id],
      );
    }

    res.json({
      success: true,
      message: "Policy updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updatePolicy error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deletePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const currentRes = await db.query(`SELECT * FROM policies WHERE id = $1`, [
      id,
    ]);
    if (currentRes.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Policy not found" });
    }

    const current = currentRes.rows[0];

    await db.query(`DELETE FROM policies WHERE id = $1`, [id]);
    await removeExistingFile(current.file_path);

    res.json({ success: true, message: "Policy deleted successfully" });
  } catch (error) {
    console.error("deletePolicy error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getActivePoliciesForDistributor = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, version, file_url, is_active, created_at, updated_at
       FROM policies
       WHERE is_active = true
       ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("getActivePoliciesForDistributor error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
