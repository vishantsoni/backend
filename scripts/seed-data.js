const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`Running ${file}...`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      await client.query(sql);
      console.log(`✅ ${file} completed!`);
    }
    console.log('✅ All seeder completed successfully!');
  } catch (err) {
    console.error('❌ Seeder failed:', err.message);
  } finally {
    client.release();
  }
  await pool.end();
}

runMigration();

