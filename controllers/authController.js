const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// exports.register = async (req, res) => {
//     const { phone, email, password, referrer_id } = req.body;

//     if (!phone || !password) {
//         return res.status(400).json({ message: 'Phone and password are required' });
//     }

//     try {
//         // Auto-generate unique 10-digit username
//         const generateUsername = async () => {
//             let username;
//             let attempts = 0;
//             while (attempts < 3) {
//                 username = crypto.randomInt(1000000000, 9999999999).toString();
//                 const exists = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
//                 if (exists.rows.length === 0) return username;
//                 attempts++;
//             }
//             throw new Error('Failed to generate unique username');
//         };

//         const username = await generateUsername();

//         // Hash password
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);

//         let nodePath = '';
//         if (referrer_id) {
//             const referrer = await db.query('SELECT node_path FROM users WHERE id = $1', [referrer_id]);
//             if (referrer.rows.length > 0) {
//                 nodePath = `${referrer.rows[0].node_path}.${username}`;
//             }
//         } else {
//             nodePath = username;
//         }

//         // Insert (phone after email)
//         const newUser = await db.query(
//             'INSERT INTO users (username, email, phone, password_hash, referrer_id, node_path) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
//             [username, email, phone, hashedPassword, referrer_id, nodePath]
//         );

//         res.status(201).json({ message: "User registered successfully", user: newUser.rows[0] });
//     } catch (err) {
//         console.error(err.message);
//         res.status(500).send('Server Error');
//     }
// };

exports.register = async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { phone, email, password, referrer_id } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Phone and password are required" });
    }

    // 🔹 Generate username
    const generateUsername = async () => {
      let username;
      let attempts = 0;

      while (attempts < 5) {
        username = crypto.randomInt(1000000000, 9999999999).toString();

        const exists = await client.query(
          "SELECT 1 FROM users WHERE username = $1",
          [username],
        );

        if (exists.rows.length === 0) return username;
        attempts++;
      }

      throw new Error("Username generation failed");
    };

    const username = await generateUsername();

    // 🔹 Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 🔥 LOCK REFERRER ROW
    const referrerRes = await client.query(
      "SELECT id, node_path, binary_path FROM users WHERE id = $1 FOR UPDATE",
      [referrer_id],
    );

    if (referrerRes.rows.length === 0) {
      throw new Error("Invalid referrer");
    }

    const parent = referrerRes.rows[0];

    // 🔥 CHECK CHILDREN (LOCK THEM TOO)
    const childrenRes = await client.query(
      `SELECT position FROM users
             WHERE subpath(binary_path, 0, nlevel(binary_path)-1) = $1
             FOR UPDATE`,
      [parent.binary_path],
    );

    const taken = childrenRes.rows.map((r) => r.position);

    let position;

    if (!taken.includes(1)) {
      position = 1; // LEFT
    } else if (!taken.includes(2)) {
      position = 2; // RIGHT
    } else {
      throw new Error("Both legs are already filled");
    }

    // 🔹 Build paths
    const binaryPath = `${parent.binary_path}.${position}`;
    const nodePath = `${parent.node_path}.${username}`;

    // 🔹 Insert user
    const newUser = await client.query(
      `INSERT INTO users 
            (username, email, phone, password_hash, referrer_id, node_path, binary_path, position)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *`,
      [
        username,
        email,
        phone,
        hashedPassword,
        referrer_id,
        nodePath,
        binaryPath,
        position,
      ],
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "User registered successfully",
      user: newUser.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error(err.message);

    res.status(400).json({
      message: err.message || "Registration failed",
    });
  } finally {
    client.release();
  }
};

exports.login = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res
      .status(400)
      .json({
        message: "Identifier (username/phone/email) and password required",
      });
  }

  try {
    // Find user by username OR phone OR email
    const user = await db.query(
      "SELECT * FROM users WHERE username = $1 OR phone = $1 LIMIT 1",
      [req.body[identifier]],
    );

    if (user.rows.length === 0) {
      return res
        .status(202)
        .json({ status: false, message: "Invalid username or phone" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!isMatch) {
      return res
        .status(202)
        .json({ status: false, message: "Invalid credentials" });
    }

    const profile = await db.query(
      "SELECT * FROM kyc_documents WHERE user_id = $1 AND document_type = $2",
      [user.rows[0].id, "profile"],
    );

    user.rows[0].profile_pic =
      profile.rows.length > 0 ? profile.rows[0].file_url : null;

    // JWT Token
    const token = jwt.sign(
      {
        id: user.rows[0].id,
        role: user.rows[0].role,
        username: user.rows[0].username,
        kyc_status: user.rows[0].kyc_status,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      status: true,
      token,
      user: user.rows[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};
