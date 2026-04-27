const db = require("../config/db");
const fs = require("fs/promises");
const path = require("path");

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function saveBannerFile(file) {
  const uploadDir = "uploads/banners";
  await fs.mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
  const filePath = path.join(uploadDir, fileName);

  await fs.writeFile(filePath, file.buffer);

  return `${process.env.APP_URL}/${uploadDir}/${fileName}`;
}

function validateBannerFile(file, fieldName) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return `Invalid file type for ${fieldName}: ${file.mimetype}. Allowed types: jpeg, jpg, png, webp, gif`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large for ${fieldName} (max 5MB)`;
  }
  return null;
}

exports.getBanners = async (req, res) => {
  try {
    const { position } = req.query;

    let query = `
      SELECT id, title, subtitle, image_url, mobile_image_url, link_type, link_value,
             display_order, position, status, start_date, end_date, created_at, updated_at
      FROM banners
      WHERE status = 'active'
        AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
        AND (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP)
    `;
    const params = [];

    if (position) {
      query += ` AND position = $1`;
      params.push(position);
    }

    query += ` ORDER BY display_order ASC, created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.addBanner = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      link_type,
      link_value,
      display_order,
      position,
      start_date,
      end_date,
    } = req.body;

    // Handle image file upload
    let image_url = null;
    let mobile_image_url = null;

    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find((f) => f.fieldname === "image");
      const mobileImageFile = req.files.find(
        (f) => f.fieldname === "mobile_image",
      );

      if (imageFile) {
        const validationError = validateBannerFile(imageFile, "image");
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        image_url = await saveBannerFile(imageFile);
      }

      if (mobileImageFile) {
        const validationError = validateBannerFile(
          mobileImageFile,
          "mobile_image",
        );
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        mobile_image_url = await saveBannerFile(mobileImageFile);
      }
    }

    if (!image_url) {
      return res
        .status(400)
        .json({ success: false, message: "Image is required" });
    }

    const result = await db.query(
      `INSERT INTO banners (
        title, subtitle, image_url, mobile_image_url, link_type, link_value,
        display_order, position, status, start_date, end_date, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        title || null,
        subtitle || null,
        image_url,
        mobile_image_url || null,
        link_type || "external",
        link_value || null,
        display_order || 0,
        position || "home_main",
        "active",
        start_date || null,
        end_date || null,
      ],
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Banner created successfully",
    });
  } catch (error) {
    console.error("Error creating banner:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      subtitle,
      link_type,
      link_value,
      display_order,
      position,
      status,
      start_date,
      end_date,
    } = req.body;

    // Handle image file upload for update
    let image_url = null;
    let mobile_image_url = null;

    if (req.files && req.files.length > 0) {
      const imageFile = req.files.find((f) => f.fieldname === "image");
      const mobileImageFile = req.files.find(
        (f) => f.fieldname === "mobile_image",
      );

      if (imageFile) {
        const validationError = validateBannerFile(imageFile, "image");
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        image_url = await saveBannerFile(imageFile);
      }

      if (mobileImageFile) {
        const validationError = validateBannerFile(
          mobileImageFile,
          "mobile_image",
        );
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        mobile_image_url = await saveBannerFile(mobileImageFile);
      }
    }

    const result = await db.query(
      `UPDATE banners
       SET title          = COALESCE($1, title),
           subtitle       = COALESCE($2, subtitle),
           image_url      = COALESCE($3, image_url),
           mobile_image_url = COALESCE($4, mobile_image_url),
           link_type      = COALESCE($5, link_type),
           link_value     = COALESCE($6, link_value),
           display_order  = COALESCE($7, display_order),
           position       = COALESCE($8, position),
           status         = COALESCE($9, status),
           start_date     = COALESCE($10, start_date),
           end_date       = COALESCE($11, end_date),
           updated_at     = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [
        title,
        subtitle,
        image_url,
        mobile_image_url,
        link_type,
        link_value,
        display_order,
        position,
        status,
        start_date,
        end_date,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Banner updated successfully",
    });
  } catch (error) {
    console.error("Error updating banner:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE banners
       SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'active'
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// static content controller
exports.getAllStaticData = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, slug, content, meta_title, meta_description, status, updated_at
       FROM static_content
       WHERE status = 'published'`,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Static content not found or not published",
      });
    }

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching static content:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getStaticData = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res
        .status(400)
        .json({ success: false, message: "Slug is required" });
    }

    const result = await db.query(
      `SELECT id, title, slug, content, meta_title, meta_description, status, updated_at
       FROM static_content
       WHERE LOWER(slug) = LOWER($1) AND status = 'published'`,
      [slug],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Static content not found or not published",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching static content:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createStaticData = async (req, res) => {
  try {
    const { title, slug, content, meta_title, meta_description, status } =
      req.body;

    if (!title || !slug || !content) {
      return res.status(400).json({
        success: false,
        message: "Title, slug, and content are required",
      });
    }

    const normalizedSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");

    const result = await db.query(
      `INSERT INTO static_content (title, slug, content, meta_title, meta_description, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [
        title,
        normalizedSlug,
        content,
        meta_title,
        meta_description,
        status || "published",
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cannot create - slug already exists",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Static content created successfully",
    });
  } catch (error) {
    console.error("Error creating static content:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateStaticData = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, meta_title, meta_description, status } = req.body;

    if (!slug) {
      return res
        .status(400)
        .json({ success: false, message: "Slug is required" });
    }

    if (!title || !content) {
      return res
        .status(400)
        .json({ success: false, message: "Title and content are required" });
    }

    const normalizedSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");

    const result = await db.query(
      `UPDATE static_content
       SET
         title = $1,
         content = $2,
         meta_title = $3,
         meta_description = $4,
         status = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(slug) = LOWER($6)
       RETURNING *`,
      [
        title,
        content,
        meta_title,
        meta_description,
        status || "published",
        normalizedSlug,
      ],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Static content not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Static content updated successfully",
    });
  } catch (error) {
    console.error("Error updating static content:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
