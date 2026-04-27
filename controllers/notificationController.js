const db = require("../config/db");

// Public: List all notifications with optional filters
exports.listNotifications = async (req, res) => {
  try {
    const { target_role, priority, display_type, page, limit } = req.query;

    let query = "SELECT * FROM notifications WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    if (target_role) {
      query += ` AND target_role = $${paramIndex}`;
      params.push(target_role);
      paramIndex++;
    }

    if (priority) {
      query += ` AND priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (display_type) {
      query += ` AND display_type = $${paramIndex}`;
      params.push(display_type);
      paramIndex++;
    }

    query += " ORDER BY created_at DESC";

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const result = await db.query(query, params);

    // Count total for pagination meta
    let countQuery = "SELECT COUNT(*) FROM notifications WHERE 1=1";
    const countParams = [];
    let countIndex = 1;

    if (target_role) {
      countQuery += ` AND target_role = $${countIndex}`;
      countParams.push(target_role);
      countIndex++;
    }
    if (priority) {
      countQuery += ` AND priority = $${countIndex}`;
      countParams.push(priority);
      countIndex++;
    }
    if (display_type) {
      countQuery += ` AND display_type = $${countIndex}`;
      countParams.push(display_type);
      countIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.status(200).json({
      status: true,
      message: "Notifications fetched successfully",
      data: result.rows,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Public: Get single notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        status: false,
        message: "Valid notification ID is required",
      });
    }

    const result = await db.query("SELECT * FROM notifications WHERE id = $1", [
      parsedId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Notification fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Admin/SuperAdmin: Create notification
exports.createNotification = async (req, res) => {
  try {
    const {
      sender_id,
      title,
      message,
      image_url,
      display_type,
      target_role,
      target_id,
      priority,
    } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({
        status: false,
        message: "Title is required and must be a non-empty string",
      });
    }

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        status: false,
        message: "Message is required and must be a non-empty string",
      });
    }

    // Validate display_type if provided
    const validDisplayTypes = ["POPUP", "BAR"];
    if (
      display_type &&
      !validDisplayTypes.includes(display_type.toUpperCase())
    ) {
      return res.status(400).json({
        status: false,
        message: "display_type must be either 'POPUP' or 'BAR'",
      });
    }

    // Validate target_role if provided
    const validTargetRoles = ["customer", "distributor", "all"];
    if (target_role && !validTargetRoles.includes(target_role.toLowerCase())) {
      return res.status(400).json({
        status: false,
        message:
          "target_role must be either 'customer', 'distributor', or 'all'",
      });
    }

    // Validate priority if provided
    const validPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
    if (priority && !validPriorities.includes(priority.toUpperCase())) {
      return res.status(400).json({
        status: false,
        message: "priority must be one of: 'LOW', 'NORMAL', 'HIGH', 'URGENT'",
      });
    }

    const result = await db.query(
      `INSERT INTO notifications 
        (sender_id, title, message, image_url, display_type, target_role, target_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sender_id ? parseInt(sender_id) : null,
        title.trim(),
        message.trim(),
        image_url || null,
        display_type ? display_type.toUpperCase() : null,
        target_role ? target_role.toLowerCase() : null,
        target_id ? parseInt(target_id) : null,
        priority ? priority.toUpperCase() : "NORMAL",
      ],
    );

    res.status(201).json({
      status: true,
      message: "Notification created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Admin/SuperAdmin: Update notification
exports.updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        status: false,
        message: "Valid notification ID is required",
      });
    }

    const {
      sender_id,
      title,
      message,
      image_url,
      display_type,
      target_role,
      target_id,
      priority,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (sender_id !== undefined) {
      updates.push(`sender_id = $${paramIndex}`);
      values.push(sender_id ? parseInt(sender_id) : null);
      paramIndex++;
    }

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({
          status: false,
          message: "Title must be a non-empty string",
        });
      }
      updates.push(`title = $${paramIndex}`);
      values.push(title.trim());
      paramIndex++;
    }

    if (message !== undefined) {
      if (typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({
          status: false,
          message: "Message must be a non-empty string",
        });
      }
      updates.push(`message = $${paramIndex}`);
      values.push(message.trim());
      paramIndex++;
    }

    if (image_url !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      values.push(image_url || null);
      paramIndex++;
    }

    if (display_type !== undefined) {
      const validDisplayTypes = ["POPUP", "BAR"];
      if (!validDisplayTypes.includes(display_type.toUpperCase())) {
        return res.status(400).json({
          status: false,
          message: "display_type must be either 'POPUP' or 'BAR'",
        });
      }
      updates.push(`display_type = $${paramIndex}`);
      values.push(display_type.toUpperCase());
      paramIndex++;
    }

    if (target_role !== undefined) {
      const validTargetRoles = ["customer", "distributor", "all"];
      if (!validTargetRoles.includes(target_role.toLowerCase())) {
        return res.status(400).json({
          status: false,
          message:
            "target_role must be either 'customer', 'distributor', or 'all'",
        });
      }
      updates.push(`target_role = $${paramIndex}`);
      values.push(target_role.toLowerCase());
      paramIndex++;
    }

    if (target_id !== undefined) {
      updates.push(`target_id = $${paramIndex}`);
      values.push(target_id ? parseInt(target_id) : null);
      paramIndex++;
    }

    if (priority !== undefined) {
      const validPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
      if (!validPriorities.includes(priority.toUpperCase())) {
        return res.status(400).json({
          status: false,
          message: "priority must be one of: 'LOW', 'NORMAL', 'HIGH', 'URGENT'",
        });
      }
      updates.push(`priority = $${paramIndex}`);
      values.push(priority.toUpperCase());
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: false,
        message: "No fields to update",
      });
    }

    values.push(parsedId);

    const result = await db.query(
      `UPDATE notifications SET ${updates.join(
        ", ",
      )} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Notification updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Admin/SuperAdmin: Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        status: false,
        message: "Valid notification ID is required",
      });
    }

    const result = await db.query(
      "DELETE FROM notifications WHERE id = $1 RETURNING *",
      [parsedId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Notification deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};
