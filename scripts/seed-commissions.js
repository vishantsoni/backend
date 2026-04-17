const db = require('../config/db');

async function seedCommissions() {
  const levels = [
    { level_no: 1, commission_percentage: 15.00 },
    { level_no: 2, commission_percentage: 10.00 },
    { level_no: 3, commission_percentage: 8.00 },
    { level_no: 4, commission_percentage: 5.00 },
    { level_no: 5, commission_percentage: 3.00 },
    { level_no: 6, commission_percentage: 2.00 },
    { level_no: 7, commission_percentage: 1.00 },
  ];

  const client = await db.connect();
  try {
    for (const level of levels) {
      await client.query(
        `INSERT INTO level_commissions (level_no, commission_percentage) 
         VALUES ($1, $2)
         ON CONFLICT (level_no) DO NOTHING`,
        [level.level_no, level.commission_percentage]
      );
      console.log(`Seeded level ${level.level_no}: ${level.commission_percentage}%`);
    }
    console.log('✅ Commission levels seeded!');
  } finally {
    client.release();
  }
}

seedCommissions().catch(console.error);
