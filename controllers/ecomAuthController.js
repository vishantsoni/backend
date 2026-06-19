const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const crypto = require("crypto");

exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, distributor_code, isGoogleAuth } =
      req.body;

    // For Google OAuth flow, frontend sends password as empty string.
    // So allow missing password when isGoogleAuth === true.
    const isSocialUser =
      isGoogleAuth === true || String(isGoogleAuth) === "true";

    if (!name || !phone) {
      return res
        .status(400)
        .json({ status: false, error: "Name and phone required" });
    }

    if (!isSocialUser && (!password || String(password).trim() === "")) {
      return res
        .status(400)
        .json({ status: false, error: "Name, phone, password required" });
    }

    // Hash password (skip for social users)
    // NOTE: your DB has password NOT NULL, so store an empty hashed string for Google users.
    const hashedPassword = isSocialUser
      ? ""
      : await (async () => {
          const salt = await bcrypt.genSalt(10);
          return bcrypt.hash(password, salt);
        })();

    // Check unique phone (email optional, check if provided)

    let whereClause = "phone = $1";
    const checkParams = [phone];
    let paramIndex = 2;
    if (email) {
      whereClause += ` OR email = $${paramIndex}`;
      checkParams.push(email);
      paramIndex++;
    }

    const check = await db.query(
      `SELECT id FROM ecom_user WHERE ${whereClause}`,
      checkParams,
    );
    if (check.rows.length > 0) {
      return res
        .status(400)
        .json({ status: false, error: "Phone/email already registered" });
    }

    // Create user - email nullable
    let insertFields = "name, phone, password, distributor_code";
    let insertValues = [name, phone, hashedPassword, distributor_code || null];

    if (email) {
      insertFields += ", email";
      insertValues.push(email); // Prepend to match $1=email
    } else {
      insertValues.push(null); // $1=null for email
    }

    const result = await db.query(
      `INSERT INTO ecom_user (${insertFields})
       VALUES (${insertValues.map((_, i) => `$${i + 1}`).join(", ")})
       RETURNING id, name, COALESCE(email, null) as email, phone, distributor_code, status, created_at`,
      insertValues,
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      status: true,
      message: "User registered successfully",
      // insertFields,
      // insertValues
      user,
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// exports.login = async (req, res) => {
//   try {
//     const { phone, email, password } = req.body;
//     if (!phone && !email) {
//       return res
//         .status(400)
//         .json({ status: false, error: "Phone or email required" });
//     }
//     if (!password) {
//       return res
//         .status(400)
//         .json({ status: false, error: "Password required" });
//     }

//     const whereClause = phone ? "e.phone = $1" : "e.email = $1";
//     const loginId = phone || email;
//     // const user = await db.query(
//     //   `SELECT id, name, email, phone, password, status FROM ecom_user WHERE ${whereClause}`,
//     //   [loginId]
//     // );
//     const query = `SELECT
//     e.id,
//     e.name,
//     e.email,
//     e.phone,
//     e.status ,
//     json_build_object(
//         'id', u.id,
//         'full_name', u.full_name,
//         'phone', u.phone
//     ) AS user_json
//     FROM ecom_user e
//     LEFT JOIN users u ON u.referral_code = e.distributor_code WHERE ${whereClause}`;

//     console.log("query - ", query);

//     const user = await db.query(query, [loginId]);

//     if (user.rows.length === 0) {
//       return res
//         .status(400)
//         .json({ status: false, error: "Invalid credentials" });
//     }

//     const validUser = user.rows[0];
//     if (!validUser.status) {
//       return res.status(400).json({ status: false, error: "Account disabled" });
//     }

//     const isMatch = await bcrypt.compare(password, validUser.password);
//     if (!isMatch) {
//       return res
//         .status(400)
//         .json({ status: false, error: "Invalid credentials" });
//     }

//     const token = jwt.sign({ id: validUser.id }, process.env.JWT_SECRET, {
//       expiresIn: "7d",
//     });

//     delete validUser.password;
//     res.json({
//       status: true,
//       message: "Login successful",
//       user: validUser,
//       token,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ status: false, error: "Server error" });
//   }
// };

exports.login = async (req, res) => {
  try {
    const { phone, email, password, isGoogleAuth } = req.body;

    if (!phone && !email) {
      return res
        .status(400)
        .json({ status: false, error: "Phone or email required" });
    }
    if (!password) {
      return res
        .status(400)
        .json({ status: false, error: "Password required" });
    }

    const whereClause = phone ? "e.phone = $1" : "e.email = $1";
    const loginId = phone || email;

    // FIX: added e.password to the SELECT statement
    const query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        e.password, 
        e.status,
        json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'phone', u.phone
        ) AS distributor_info
      FROM ecom_user e
      LEFT JOIN users u ON u.referral_code = e.distributor_code 
      WHERE ${whereClause}
    `;

    const result = await db.query(query, [loginId]);

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ status: false, error: "Invalid credentials" });
    }

    const validUser = result.rows[0];

    // 1. Status Check
    if (!validUser.status) {
      return res.status(400).json({ status: false, error: "Account disabled" });
    }

    // 2. Password Check (Now validUser.password exists)
    const isMatch = await bcrypt.compare(password, validUser.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ status: false, error: "Invalid credentials" });
    }

    // 3. JWT Token
    const token = jwt.sign(
      { id: validUser.id, type: "ECOM_USER" },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // 4. Security: Password delete karo response bhejne se pehle
    delete validUser.password;

    res.json({
      status: true,
      message: "Login successful",
      user: validUser,
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.authMe = async (req, res) => {
  try {
    const user = await db.query(
      `SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        e.password, 
        e.status,
        e.distributor_code,
        json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'phone', u.phone
        ) AS distributor_info
      FROM ecom_user e
      LEFT JOIN users u ON u.referral_code = e.distributor_code
       WHERE e.id = $1`,
      [req.user.id],
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ status: false, error: "User not found" });
    }
    res.json({ status: true, user: user.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.google = async (req, res) => {
  try {
    const { token } = req.body;
    const decode = jwt.decode(token);
    console.log("decode - ", decode);

    const email = decode?.email;

    const whereClause = "e.email = $1";
    const loginId = email;

    // FIX: added e.password to the SELECT statement
    const query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        e.password, 
        e.status,
        json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'phone', u.phone
        ) AS distributor_info
      FROM ecom_user e
      LEFT JOIN users u ON u.referral_code = e.distributor_code 
      WHERE ${whereClause}
    `;

    const result = await db.query(query, [loginId]);

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ status: false, error: "Invalid credentials" });
    }

    const validUser = result.rows[0];

    // 1. Status Check
    if (!validUser.status) {
      return res.status(400).json({ status: false, error: "Account disabled" });
    }

    // 2. Password Check (Now validUser.password exists)
    // const isMatch = await bcrypt.compare(password, validUser.password);
    // if (!isMatch) {
    //   return res
    //     .status(400)
    //     .json({ status: false, error: "Invalid credentials" });
    // }

    // 3. JWT Token
    const jwt_token = jwt.sign(
      { id: validUser.id, type: "ECOM_USER" },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // 4. Security: Password delete karo response bhejne se pehle
    delete validUser.password;

    res.json({
      status: true,
      message: "Login successful",
      user: validUser,
      token: jwt_token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

// ==========================
// Google OAuth - Check/Create
// ==========================
// Frontend calls:
// POST api/ecom/auth/google-check { token: idToken }
// Expected response schema:
// - { status:true, isExistingUser:true, token:<jwt> }
// - { status:true, isExistingUser:false, googleData:{name,email} }
exports.googleCheck = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Google token is required",
      });
    }

    // Decode Google id_token payload (no verification using Google certs here).
    // This matches your current backend setup (JWT secret for your own tokens).
    // For production-grade security, verify signature using google-auth-library.
    const decoded = jwt.decode(token);

    const email = decoded?.email;
    const name = decoded?.name || decoded?.given_name || "";

    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Google account email not found in token",
      });
    }

    // Check if user exists already
    const existing = await db.query(
      `SELECT id, name, email, phone, distributor_code, status
       FROM ecom_user
       WHERE email = $1
       LIMIT 1`,
      [email],
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.status) {
        return res
          .status(400)
          .json({ status: false, message: "Account disabled" });
      }

      const appToken = jwt.sign(
        { id: user.id, type: "ECOM_USER" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      return res.json({
        status: true,
        isExistingUser: true,
        token: appToken,
      });
    }

    // New user -> return googleData for prefill
    return res.json({
      status: true,
      isExistingUser: false,
      googleData: {
        name: name,
        email: email,
      },
    });
  } catch (err) {
    console.error("googleCheck error:", err);
    return res.status(500).json({
      status: false,
      message: "Google verification failed",
    });
  }
};
