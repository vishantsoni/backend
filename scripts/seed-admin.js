const pool = require("../config/db");
const bcrypt = require("bcrypt");

async function seedAdminData() {
  try {
    // Generate unique username for admin (10-digit like system)
    const username = "9999999999"; // Use phone as username for simplicity, or generate if needed

    // Hash password with same salt rounds as auth
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("12345678", salt);

    // Insert Super Admin with full schema (ON CONFLICT DO NOTHING)
    await pool.query(
      `INSERT INTO users (
        full_name, aadhaar_no, dob, gender, pan_no, email, phone, whatsapp_no,
        address, city, state, pin,
        bank_name, account_holder_name, account_no, ifsc_code, branch,
        referral_code, referrer_name, referrer_contact,
        nominee_name, nominee_relationship, nominee_age, nominee_contact, nominee_aadhaar,
        business_level, agreed_to_terms, kyc_status,
        username, password_hash, referrer_id,
        node_path, binary_path, position, is_active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,
        $18,$19,$20,
        $21,$22,$23,$24,$25,
        $26,$27,$28,
        $29,$30,$31,
        $32,$33,$34,$35
      ) ON CONFLICT (phone) DO NOTHING`,
      [
        "Super Admin", // $1 full_name
        null, // $2 aadhaar_no
        "1970-01-01", // $3 dob
        "Male", // $4 gender
        null, // $5 pan_no
        "admin@gmail.com", // $6 email
        "9999999999", // $7 phone
        null, // $8 whatsapp_no
        null, // $9 address
        null, // $10 city
        null, // $11 state
        null, // $12 pin
        null, // $13 bank_name
        null, // $14 account_holder_name
        null, // $15 account_no
        null, // $16 ifsc_code
        null, // $17 branch
        "ADMIN001", // $18 referral_code
        null, // $19 referrer_name
        null, // $20 referrer_contact
        null, // $21 nominee_name
        null, // $22 nominee_relationship
        18, // $23 nominee_age
        null, // $24 nominee_contact
        null, // $25 nominee_aadhaar
        99, // $26 business_level (max)
        true, // $27 agreed_to_terms
        true, // $28 kyc_status
        username, // $29 username
        hashedPassword, // $30 password_hash
        null, // $31 referrer_id (root)
        username, // $32 node_path
        "1", // $33 binary_path (root left)
        1, // $34 position (left)
        true, // $35 is_active
      ],
    );

    console.log("✅ Super Admin seeded successfully!");
    console.log("📱 Phone: 9999999999");
    console.log("🔑 Password: 12345678");
    console.log("👑 Role: Super Admin");
  } catch (error) {
    console.error("❌ Error seeding admin data:", error);
  } finally {
    pool.end();
  }
}

seedAdminData();
