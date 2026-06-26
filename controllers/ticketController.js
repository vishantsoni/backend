// controllers/ticketController.js
const pool = require("../config/db");
const path = require("path");
const fs = require("fs/promises");

// Note: do not use slug / pathModule vars; multer handles ticket attachments.

// Existing raiseTicket - already matches new schema
exports.raiseTicket = async (req, res) => {
  const {
    name,
    email,
    phone,
    subject,
    message,
    user_id,
    user_type,
    attachment,
  } = req.body;

  // Frontend sends multipart/form-data with field name: "attachment" (can contain up to 2 files)
  const uploadedFiles = (
    Array.isArray(req.files) ? req.files : req.file ? [req.file] : []
  ).filter((f) => f && f.fieldname === "attachment");

  // Generate unique Case ID: FS + Year + Random (e.g., FS-2026-123456)
  const currentYear = new Date().getFullYear();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const caseId = `FS-${currentYear}-${randomSuffix}`;

  try {
    // Determine which foreign key column to populate

    const distributorId = user_type === "DISTRIBUTOR" ? user_id : null;
    const ecomUserId = user_type === "ECOM_USER" ? user_id : null;

    const query = `
      INSERT INTO tickets (
        case_id, 
        distributor_id, 
        ecom_user_id, 
        name, 
        email, 
        phone, 
        subject, 
        message,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')
      RETURNING *;
    `;

    const values = [
      caseId,
      distributorId,
      ecomUserId,
      name,
      email,
      phone,
      subject,
      message,
    ];

    const result = await pool.query(query, values);

    // store attachment in first reply if exists
    // Frontend sends multipart/form-data with field name: attachment
    let attachmentValue = attachment || null;

    // Save attachments to uploads/tickets and store URLs in DB.
    // Supports:
    // - diskStorage: uploadedFile.path (but we still copy into our target folder for consistency)
    // - memoryStorage: uploadedFile.buffer
    if (uploadedFiles.length > 0) {
      const ticketUploadsDir = path.join("uploads", "tickets");
      await fs.mkdir(ticketUploadsDir, { recursive: true });

      const insertedReplies = [];

      for (const uploadedFile of uploadedFiles) {
        let currentAttachmentValue = null;

        const ext = path.extname(uploadedFile.originalname || "").toLowerCase();
        const baseName = path.basename(
          uploadedFile.originalname || "attachment",
          ext,
        );
        const safeBase = baseName.replace(/[^a-z0-9_-]/gi, "_");
        const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const fileName = `${safeBase}_${uniqueSuffix}${ext || ""}`;
        const finalPath = path.join(ticketUploadsDir, fileName);

        if (uploadedFile.buffer) {
          await fs.writeFile(finalPath, uploadedFile.buffer);
        } else if (uploadedFile.path) {
          // Copy the disk-stored file into uploads/tickets
          const fileBytes = await fs.readFile(uploadedFile.path);
          await fs.writeFile(finalPath, fileBytes);
        }

        const relativeUrlPath = `/uploads/tickets/${fileName}`;
        currentAttachmentValue = `${process.env.APP_URL}${relativeUrlPath}`;

        const replyQuery = `
          INSERT INTO ticket_replies (
            ticket_id,
            replied_by,
            replied_by_type,
            message,
            attachment,
            is_admin
          )
          VALUES ($1, $2, $3, $4, $5, false)
          RETURNING *
        `;

        const replyValues = [
          result.rows[0].id,
          user_id || null,
          user_type || "USER",
          message,
          currentAttachmentValue,
        ];

        const replyRes = await pool.query(replyQuery, replyValues);
        insertedReplies.push(replyRes.rows[0]);
      }

      attachmentValue = insertedReplies.length
        ? insertedReplies[0].attachment
        : null;
    }

    // If there are no attachments, still create a reply row with message only.
    if (!uploadedFiles.length) {
      const firstReplyQuery = `
        INSERT INTO ticket_replies (
          ticket_id,
          replied_by,
          replied_by_type,
          message,
          attachment,
          is_admin
        )
        VALUES ($1, $2, $3, $4, $5, false)
        RETURNING *
      `;

      const firstReplyValues = [
        result.rows[0].id,
        user_id || null,
        user_type || "USER",
        message,
        null,
      ];

      await pool.query(firstReplyQuery, firstReplyValues);
    }

    res.status(201).json({
      success: true,
      caseId: result.rows[0].case_id,
      message:
        "Support ticket raised successfully. Please note your Case ID for tracking.",
    });
  } catch (err) {
    console.error("Ticket Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error while raising ticket.",
    });
  }
};

// Get user's tickets (by distributor_id or ecom_user_id)
exports.getUserTickets = async (req, res) => {
  const { id, type } = req.user; // from auth middleware or query

  try {
    const userColumn =
      type === "DISTRIBUTOR" ? "distributor_id" : "ecom_user_id";

    // const whereClause = "WHERE ecom_user_id = $1";

    const query = `
      SELECT 
        t.id, 
        t.case_id, 
        t.subject, 
        t.status, 
        t.created_at, 
        t.updated_at,
        -- Check if there are any admin replies created after the user last read the ticket
        EXISTS (
          SELECT 1 FROM ticket_replies tr
          LEFT JOIN ticket_reads trd 
            ON tr.ticket_id = trd.ticket_id 
            AND trd.reply_id = tr.id
            AND trd.viewer_user_id = $1 
            AND trd.viewer_user_type = $2
          WHERE tr.ticket_id = t.id            
            AND tr.created_at > COALESCE(trd.last_read_at, '1970-01-01'::timestamptz)
        ) AS is_unread
      FROM tickets t
      WHERE t.${userColumn} = $1
      ORDER BY t.updated_at DESC
    `;

    // const query = `
    //   SELECT id, case_id, subject, status, created_at, updated_at
    //   FROM tickets
    //   ${whereClause}
    //   ORDER BY created_at DESC
    // `;

    const result = await pool.query(query, [id, type]);

    res.json({
      query,
      success: true,
      tickets: result.rows,
    });
  } catch (err) {
    console.error("Get user tickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Get ticket details with replies (auto-mark read + badge for raiser)
exports.getTicketDetails = async (req, res) => {
  const { caseId } = req.params;

  console.log("ticket details - ", req.user);

  // Viewer (raiser or admin) comes from auth middleware.
  // Note: your route currently does NOT require auth for this GET,
  // so unread badge/mark-read will be applied only if req.user is present.
  const viewerId = req.user?.id ?? null;
  const viewerType = req.user?.type ?? null;

  try {
    const ticketQuery = `
      SELECT * FROM tickets WHERE case_id = $1
    `;
    const ticketResult = await pool.query(ticketQuery, [caseId]);

    if (ticketResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Ticket not found" });
    }

    const repliesQuery = `
      SELECT * FROM ticket_replies 
      WHERE ticket_id = $1 
      ORDER BY created_at ASC
    `;
    const repliesResult = await pool.query(repliesQuery, [
      ticketResult.rows[0].id,
    ]);

    // Mark viewer's read timestamp (auto-mark read)
    if (viewerId && viewerType) {
      await pool.query(
        `
          INSERT INTO ticket_reads (ticket_id, viewer_user_id, viewer_user_type, reply_id, last_read_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (ticket_id, viewer_user_id, viewer_user_type)
          DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
        `,
        [
          ticketResult.rows[0].id,
          viewerId,
          viewerType,
          repliesResult.rows[0].id || null,
        ],
      );
    }

    // Badge count for raiser (ECOM_USER / DISTRIBUTOR): count admin replies after raiser last_read_at
    let raiserUnreadCount = 0;
    try {
      const raiserUserId =
        ticketResult.rows[0].ecom_user_id ||
        ticketResult.rows[0].distributor_id;
      const raiserUserType = ticketResult.rows[0].ecom_user_id
        ? "ECOM_USER"
        : ticketResult.rows[0].distributor_id
        ? "DISTRIBUTOR"
        : null;

      if (raiserUserId && raiserUserType) {
        const raiserRead = await pool.query(
          `SELECT COALESCE(last_read_at, '1970-01-01'::timestamptz) AS last_read_at
           FROM ticket_reads
           WHERE ticket_id = $1 AND viewer_user_id = $2 AND viewer_user_type = $3`,
          [ticketResult.rows[0].id, raiserUserId, raiserUserType],
        );

        const lastReadAt = raiserRead.rows[0].last_read_at;
        const unreadRes = await pool.query(
          `SELECT COUNT(*)::int AS unread_count
           FROM ticket_replies
           WHERE ticket_id = $1
             AND is_admin = TRUE
             AND created_at > $2`,
          [ticketResult.rows[0].id, lastReadAt],
        );
        raiserUnreadCount = unreadRes.rows[0].unread_count;
      }
    } catch (e) {
      raiserUnreadCount = 0;
    }

    res.json({
      success: true,
      ticket: ticketResult.rows[0],
      replies: repliesResult.rows,
      unread_badge: raiserUnreadCount,
    });
  } catch (err) {
    console.error("Get ticket details error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Reply to ticket
exports.replyToTicket = async (req, res) => {
  const { caseId } = req.params;
  const { message, attachment } = req.body;

  // Attachments can come either as req.file (single) or req.files (global multer any())
  // Field name expected from frontend: "attachment"
  const uploadedFile =
    req.file ||
    (Array.isArray(req.files)
      ? req.files.find((f) => f.fieldname === "attachment") || null
      : null);

  const repliedBy = req.user.id; // from auth
  const repliedByType = req.user.type || "USER"; // USER/STAFF

  try {
    const ticketQuery = `SELECT id, status FROM tickets WHERE case_id = $1`;
    const ticketResult = await pool.query(ticketQuery, [caseId]);

    if (ticketResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Ticket not found" });
    }

    if (
      ticketResult.rows[0].status === "RESOLVED" ||
      ticketResult.rows[0].status === "CLOSED"
    ) {
      return res
        .status(404)
        .json({ success: false, error: "Ticket has been closed or resolved." });
    }

    const query = `
      INSERT INTO ticket_replies (ticket_id, replied_by, replied_by_type, message, attachment, is_admin)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    let attachmentValue = attachment || null;

    // Save uploaded attachment file (if any) and store URL in DB.
    if (uploadedFile) {
      const ticketUploadsDir = path.join("uploads", "tickets");
      await fs.mkdir(ticketUploadsDir, { recursive: true });

      const ext = path.extname(uploadedFile.originalname || "").toLowerCase();
      const baseName = path.basename(
        uploadedFile.originalname || "attachment",
        ext,
      );
      const safeBase = baseName.replace(/[^a-z0-9_-]/gi, "_");
      const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const fileName = `${safeBase}_${uniqueSuffix}${ext || ""}`;
      const finalPath = path.join(ticketUploadsDir, fileName);

      if (uploadedFile.buffer) {
        await fs.writeFile(finalPath, uploadedFile.buffer);
      } else if (uploadedFile.path) {
        const fileBytes = await fs.readFile(uploadedFile.path);
        await fs.writeFile(finalPath, fileBytes);
      }

      const relativeUrlPath = `/uploads/tickets/${fileName}`;
      attachmentValue = `${process.env.APP_URL}${relativeUrlPath}`;
    }

    const values = [
      ticketResult.rows[0].id,
      repliedBy,
      repliedByType,
      message,
      attachmentValue,
      repliedByType === "STAFF",
    ];

    const result = await pool.query(query, values);

    // Update ticket updated_at
    await pool.query(
      "UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [ticketResult.rows[0].id],
    );

    res.status(201).json({
      success: true,
      reply: result.rows[0],
    });
  } catch (err) {
    console.error("Reply error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Admin: Get all tickets (paginated)
exports.getAllTicketsAdmin = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT id, case_id, distributor_id, ecom_user_id, name, email, phone, subject, 
             status, created_at, updated_at, resolved_at
      FROM tickets
    `;
    let countQuery = "SELECT COUNT(*) FROM tickets";
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` WHERE status = $${paramIndex}`;
      countQuery += ` WHERE status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${
      paramIndex + 1
    }`;
    params.push(parseInt(limit), offset);

    const [ticketsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, paramIndex - 1)),
    ]);

    res.json({
      success: true,
      tickets: ticketsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    });
  } catch (err) {
    console.error("Admin tickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Admin: Update ticket status
exports.updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status" });
  }

  try {
    const query = `
      UPDATE tickets 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      ${
        status === "RESOLVED" || status === "CLOSED"
          ? ", resolved_at = CURRENT_TIMESTAMP"
          : ""
      }
      WHERE id = $2
      RETURNING case_id, status
    `;

    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Ticket not found" });
    }

    res.json({
      success: true,
      ticket: result.rows[0],
    });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// distributor data controller
exports.getDistributorTickets = async (req, res) => {
  const { id, user_type } = req.user; // from auth middleware or query

  try {
    const whereClause = "WHERE distributor_id = $1";

    const query = `
      SELECT id, case_id, subject, status, created_at, updated_at, name
      FROM tickets 
      ${whereClause}
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [id]);

    res.json({
      query,
      success: true,
      tickets: result.rows,
    });
  } catch (err) {
    console.error("Get user tickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
