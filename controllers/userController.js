const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const fs = require("fs/promises");
const pathModule = require("path");

exports.getDownline = async (req, res) => {
  try {
    // We get the logged-in user's path from the request (sent by middleware)
    const userPath = req.user.node_path;

    // Query: Find everyone whose path starts with the current user's path
    // The <@ operator in ltree means "is a descendant of"
    const downline = await db.query(
      "SELECT id, username, role, node_path, referrer_id FROM users WHERE node_path <@ $1 AND node_path != $1",
      [userPath],
    );

    res.json(downline.rows);
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

exports.getMyDownline = async (req, res) => {
  try {
    const userResult = await db.query(
      "SELECT node_path FROM users WHERE id = $1",
      [req.user.id],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const myPath = userResult.rows[0].node_path;

    // Fix: Explicitly cast $1 to ltree
    const downline = await db.query(
      `SELECT id, username, email, phone, node_path, referrer_id, created_at 
       FROM users 
       WHERE node_path <@ $1::ltree AND id != $2`,
      [myPath, req.user.id],
    );

    res.json({ success: true, data: downline.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getMyTree = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch the user AND all their descendants in one query
    // By using <@ (is descendant) and including the user's own path,
    // we get the full subtree in one go.
    const result = await db.query(
      `SELECT id, username, email, phone, full_name, node_path, referrer_id, referral_code, created_at 
       FROM users 
       WHERE node_path <@ (SELECT node_path FROM users WHERE id = $1)::ltree`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    const flatData = result.rows;

    // 2. Helper function to build the tree
    const buildTree = (data, rootId) => {
      return data
        .filter((item) => item.referrer_id === rootId)
        .map((item) => ({
          ...item,
          children: buildTree(data, item.id),
        }));
    };

    // 3. Find the "Top Parent" object (the logged-in user)
    const topUser = flatData.find((u) => u.id === userId);

    // 4. Build children for the top user and return as a single object (or array)
    const tree = {
      ...topUser,
      children: buildTree(flatData, userId),
    };

    // Wrapping in an array [tree] to keep it consistent with your previous structure
    res.json({ status: true, data: [tree] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { referral_code } = req.query;

    // 1. Validation: Ensure the parameter exists
    if (!referral_code) {
      return res
        .status(400)
        .json({ status: false, error: "Referral code is required" });
    }

    // 2. Fix: Pass parameters inside an array [referral_code]
    const user = await db.query(
      'SELECT id, full_name AS "name", referral_code FROM users WHERE referral_code = $1',
      [referral_code],
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    res.json({ status: true, user: user.rows[0] });
  } catch (err) {
    // 3. Security: Don't send raw error messages to the client in production
    console.error(err);
    res.status(500).json({ status: false, error: "Internal server error" });
  }
};

exports.getKycStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      "SELECT kyc_status FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "User not found" });
    }
    res.json({ status: true, kyc_status: result.rows[0].kyc_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.updateKycStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, remark } = req.body; // status: true/false, remark: optional rejection reason

    if (status === undefined) {
      return res
        .status(400)
        .json({ status: false, error: "Status required (true/false)" });
    }

    const result = await db.query(
      "UPDATE users SET kyc_status = $1 WHERE id = $2 RETURNING id, kyc_status",
      [status, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    // Optional: Log admin action or notify user
    console.log(
      `KYC ${status ? "approved" : "rejected"} for user ${userId}${remark ? ` - ${remark}` : ""}`,
    );

    res.json({
      status: true,
      message: `KYC ${status ? "approved" : "rejected"} successfully`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.createUser = async (req, res) => {
  const {
    fullName: full_name,
    aadhaarNo: aadhaar_no,
    dob,
    gender,
    panNo: pan_no,
    email,
    whatsappNo: whatsapp_no,
    phone,
    address,
    city,
    state,
    pin,
    bankName: bank_name,
    accountHolderName: account_holder_name,
    accountNo: account_no,
    ifscCode: ifsc_code,
    branch,

    referrerName: referrer_name,
    referrerContact: referrer_contact,
    referral_code,
    nomineeName: nominee_name,
    nomineeRelationship: nominee_relationship,
    nomineeAge: nominee_age,
    nomineeContact: nominee_contact,
    nomineeAadhaar: nominee_aadhaar,
    businessLevel: business_level,
    agreedToTerms: agreed_to_terms,
    password,
    referrer_id,
  } = req.body;

  try {
    if (!password) {
      return res.status(400).json({
        status: false,
        message: "Password is required for user creation.",
      });
    }

    // Auto-generate unique 10-digit username
    const generateUsername = async () => {
      let username;
      let attempts = 0;
      while (attempts < 3) {
        username = crypto.randomInt(1000000000, 9999999999).toString();
        const exists = await db.query(
          "SELECT 1 FROM users WHERE username = $1",
          [username],
        );
        if (exists.rows.length === 0) return username;
        attempts++;
      }
      throw new Error("Failed to generate unique username");
    };

    const username = await generateUsername();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let nodePath = "";
    if (referrer_id) {
      const referrer = await db.query(
        "SELECT node_path FROM users WHERE id = $1",
        [referrer_id],
      );
      if (referrer.rows.length > 0) {
        nodePath = `${referrer.rows[0].node_path}.${username}`;
      }
    } else {
      nodePath = username;
    }

    // Generate or validate referral_code (FSYYMMSN format)
    let finalReferralCode = referral_code;

    if (finalReferralCode) {
      // Validate provided code exists
      const exists = await db.query(
        "SELECT 1 FROM users WHERE referral_code = $1",
        [finalReferralCode],
      );
      if (exists.rows.length > 0) {
        return res
          .status(400)
          .json({ status: false, message: "Referral code already exists" });
      }
    } else {
      // Auto-generate FS + YY + MM + SN (sequential per year-month)
      const now = new Date();
      const year = (now.getFullYear() % 100).toString().padStart(2, "0");
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const prefix = `FS${year}${month}`;

      let sn = 1;
      let attempts = 0;
      const maxAttempts = 100;
      while (attempts < maxAttempts) {
        const snStr = sn.toString().padStart(4, "0"); // Allow up to 9999 per month
        const candidateCode = `${prefix}${snStr}`;
        if (candidateCode.length > 20) {
          throw new Error("Referral code too long");
        }

        const exists = await db.query(
          "SELECT 1 FROM users WHERE referral_code = $1",
          [candidateCode],
        );
        if (exists.rows.length === 0) {
          finalReferralCode = candidateCode;
          break;
        }
        sn++;
        attempts++;
      }
      if (!finalReferralCode) {
        return res.status(400).json({
          status: false,
          message: "Unable to generate unique referral code. Try later.",
        });
      }
    }

    // INSERT all fields + phone (email, phone, whatsapp_no...)
    const newUser = await db.query(
      `
            INSERT INTO users (
                full_name, aadhaar_no, dob, gender, pan_no, email, phone, whatsapp_no, address, city, state, pin,
                bank_name, account_holder_name, account_no, ifsc_code, branch,
                referral_code, referrer_name, referrer_contact,
                nominee_name, nominee_relationship, nominee_age, nominee_contact, nominee_aadhaar,
                business_level, agreed_to_terms, kyc_status, username, password_hash, referrer_id, node_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
            RETURNING *
        `,
      [
        full_name || null,
        aadhaar_no || null,
        dob,
        gender || null,
        pan_no || null,
        email || null,
        phone || null,
        whatsapp_no || null,
        address || null,
        city || null,
        state || null,
        pin || null,
        bank_name || null,
        account_holder_name || null,
        account_no || null,
        ifsc_code || null,
        branch || null,
        finalReferralCode,
        referrer_name || null,
        referrer_contact || null,
        nominee_name || null,
        nominee_relationship || null,
        nominee_age,
        nominee_contact || null,
        nominee_aadhaar || null,
        Number(business_level) || 1,
        !!agreed_to_terms,
        false, // kyc_status default
        username,
        hashedPassword,
        referrer_id || null,
        nodePath,
      ],
    );

    res.status(201).json({
      status: true,
      message: "User created successfully with full profile",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err.message);
    res
      .status(500)
      .json({ status: false, message: "Server Error", error: err.message });
  }
};

exports.uploadKycDocuments = async (req, res) => {
  try {
    const userId = req.body.id;

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ status: false, error: "No files uploaded" });
    }

    const uploadDir = pathModule.join("uploads", "kyc", userId.toString());
    await fs.mkdir(uploadDir, { recursive: true });

    const documentTypes = [
      "PAN",
      "Aadhaar_Front",
      "Aadhaar_Back",
      "passbook",
      "profile",
    ]; // Allowed types
    const uploadedFiles = [];

    for (const file of req.files) {
      const docType = file.fieldname || "unknown"; // fieldname = document_type from form
      if (!documentTypes.includes(docType.replace(/[_-]/g, "_"))) {
        continue; // Skip invalid types
      }

      const safeFileName =
        docType.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".jpg";
      const filePath = pathModule.join(uploadDir, safeFileName);
      const publicUrl = `${process.env.APP_URL}/uploads/kyc/${userId}/${safeFileName}`;

      await fs.writeFile(filePath, file.buffer);

      // Insert or UPSERT document record
      await db.query(
        `
        INSERT INTO kyc_documents (user_id, document_type, file_url, status, doc_no)
        VALUES ($1, $2, $3, 'pending', $4)
        ON CONFLICT (user_id, document_type) 
        DO UPDATE SET file_url = $3, status = 'pending', updated_at = CURRENT_TIMESTAMP
      `,
        [userId, docType.replace(/[_-]/g, " "), publicUrl, ""],
      ); // doc_no optional

      uploadedFiles.push({ type: docType, url: publicUrl });
    }

    res.json({
      status: true,
      message: "KYC documents uploaded successfully",
      files: uploadedFiles,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ status: false, error: "Server error uploading files" });
  }
};

exports.updateKycDocument = async (req, res) => {
  try {
    console.log("start");
    
    const { docId } = req.params;
    const { status } = req.body;

    if (!["pending", "under_review", "approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ status: false, error: "Invalid status value" });
    }

    await db.query(
      `UPDATE kyc_documents 
      SET status = $1, 
      updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 RETURNING user_id, document_type`,
      [status, docId],
    );
    res.json({
      status: true,
      message: `Document status updated to ${status} successfully`,
      document_id: docId,
    });
  } catch (error) {
    console.error(err);
    res
      .status(500)
      .json({ status: false, error: "Server error uploading files" });
  }
};

exports.submitKycRequest = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user already has pending/submitted request
    const existing = await db.query(
      "SELECT id, status FROM kyc_requests WHERE user_id = $1 AND status IN ($2, $3)",
      [userId, "pending", "submitted"],
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        status: false,
        error: `KYC request already ${existing.rows[0].status}`,
      });
    }

    // Check if has all required documents
    const docs = await db.query(
      "SELECT document_type FROM kyc_documents WHERE user_id = $1 AND status = $2",
      [userId, "pending"],
    );
    const required = [
      "PAN",
      "Aadhaar Front",
      "Aadhaar Back",
      "passbook",
      "profile",
    ];
    const hasRequired = required.every((type) =>
      docs.rows.some((d) => d.document_type === type),
    );
    if (!hasRequired) {
      return res.status(400).json({
        status: false,
        error: "Missing required KYC documents. Please upload all first.",
      });
    }

    // Create request + update docs to under_review
    const requestResult = await db.query(
      "INSERT INTO kyc_requests (user_id, status) VALUES ($1, $2) RETURNING *",
      [userId, "under_review"],
    );

    await db.query("UPDATE kyc_documents SET status = $1 WHERE user_id = $2", [
      "under_review",
      userId,
    ]);

    res.json({
      status: true,
      message: "KYC request submitted successfully for admin review",
      request: requestResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ status: false, error: "Server error submitting request" });
  }
};

// Set transaction PIN (after KYC)
exports.setTransactionPin = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pin } = req.body;

    if (!pin || pin.length < 4 || pin.length > 6 || !/^[0-9]+$/.test(pin)) {
      return res.status(400).json({ status: false, error: 'PIN must be 4-6 digits' });
    }

    // Check KYC
    const kycStatus = await db.query('SELECT kyc_status FROM users WHERE id = $1', [userId]);
    if (!kycStatus.rows[0]?.kyc_status) {
      return res.status(400).json({ status: false, error: 'KYC approval required to set PIN' });
    }

    const hash = await bcrypt.hash(pin, 10);

    await db.query(
      'UPDATE users SET transaction_pin_hash = $1 WHERE id = $2',
      [hash, userId]
    );

    res.json({ status: true, hash, message: 'Transaction PIN set successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

// Change password (60 day rule)
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await db.query('SELECT password_hash, last_password_change FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ status: false, error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!isMatch) return res.status(400).json({ status: false, error: 'Invalid current password' });

    // 60 day check
    const lastChange = user.rows[0].last_password_change;
    if (lastChange && (Date.now() - new Date(lastChange).getTime()) < 60 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ status: false, error: 'Password must be changed every 60 days minimum' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, last_password_change = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, userId]
    );

    res.json({ status: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};
