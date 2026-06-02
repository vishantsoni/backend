const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(process.cwd(), "uploads", "tickets");

// Ensure destination exists
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const baseName = path.basename(file.originalname || "upload", ext);
    const safeBase = baseName.replace(/[^a-z0-9_-]/gi, "_");
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    cb(null, `${safeBase}_${uniqueSuffix}${ext || ""}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Field name must be: attachment
// Accept up to 2 attachments from the frontend using the same field name: "attachment"
const uploadTicketAttachment = upload.array("attachment", 2);

module.exports = { uploadTicketAttachment };
