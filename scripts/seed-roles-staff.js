const db = require("../config/db");
const bcrypt = require("bcrypt");

async function seed() {
  const client = await db.connect();
  try {
    console.log("🌱 Seeding roles & staff...");

    // Roles already seeded in migration, but re-run safe

    // Create sample admin user if not exists
    const adminUsername = "admin1234567890";
    const adminExists = await client.query(
      "SELECT id FROM users WHERE username = $1",
      [adminUsername],
    );
    if (adminExists.rows.length === 0) {
      const hashedPass = await bcrypt.hash("admin123", 10);
      await client.query(
        `
        INSERT INTO users (username, full_name, email, phone, password_hash, role_id, kyc_status, is_active)
        VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = 'admin'), true, true)
      `,
        [
          adminUsername,
          "Admin",
          "admin@feel safe.com",
          "6396617715",
          hashedPass,
        ],
      );
      console.log("✅ Sample admin created: admin123 / admin123");
    }

    // Sample staff
    const staffRoleId = (
      await client.query('SELECT id FROM roles WHERE name = "staff"')
    ).rows[0]?.id;
    if (staffRoleId) {
      const staffEmail = "staff1@example.com";
      const staffExists = await client.query(
        "SELECT id FROM users WHERE email = $1",
        [staffEmail],
      );
      if (staffExists.rows.length === 0) {
        const hashedPass = await bcrypt.hash("staff123", 10);
        const userResult = await client.query(
          `
          INSERT INTO users (username, full_name, email, phone, password_hash, role_id, kyc_status, is_active)
          VALUES ('staff0987654321', $1, $2, $3, $4, $5, true, true) RETURNING id
        `,
          ["Staff One", staffEmail, "8888888888", hashedPass, staffRoleId],
        );

        await client.query(
          `
          INSERT INTO staff (user_id, role_id, department, designation, salary, hire_date)
          VALUES ($1, $2, $3, $4, 50000, CURRENT_DATE)
        `,
          [
            userResult.rows[0].id,
            staffRoleId,
            "Support",
            "Support Staff",
            50000,
          ],
        );
        console.log("✅ Sample staff created: staff1@example.com / staff123");
      }
    }

    console.log("✅ Seed complete!");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    client.release();
  }
}

seed();
