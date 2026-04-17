const db = require('../config/db');
require('dotenv').config();

async function seedCoupons() {
  const client = await db.connect();
  try {
    // Sample coupons
    const coupons = [
      {
        code: 'WELCOME10',
        discount_type: 'percentage',
        discount_amount: 10,
        min_order_amount: 500,
        max_discount_amount: 200,
        usage_limit: 100,
        expires_at: '2025-03-31',
        status: 'active'
      },
      {
        code: 'FIRST50',
        discount_type: 'fixed',
        discount_amount: 50,
        min_order_amount: 1000,
        usage_limit: 50,
        valid_from: '2024-10-01',
        status: 'active'
      },
      {
        code: 'TESTPERCENT',
        discount_type: 'percentage',
        discount_amount: 25,
        usage_limit: 5,
        status: 'active'
      }
    ];

    for (const couponData of coupons) {
      const result = await client.query(`
        INSERT INTO coupons (
          code, discount_type, discount_amount, min_order_amount, max_discount_amount, 
          usage_limit, valid_from, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (code) DO NOTHING
        RETURNING code, used_count
      `, [
        couponData.code,
        couponData.discount_type,
        couponData.discount_amount,
        couponData.min_order_amount || 0,
        couponData.max_discount_amount || null,
        couponData.usage_limit,
        couponData.valid_from || null,
        couponData.expires_at || null,
        couponData.status
      ]);
      if (result.rows.length > 0) {
        console.log(`✅ Seeded coupon: ${couponData.code}`);
      } else {
        console.log(`⚠️  Coupon ${couponData.code} already exists`);
      }
    }

    const usageResult = await client.query('SELECT COUNT(*) as total_usages FROM coupon_usages');
    console.log(`📊 Total coupon usages tracked: ${usageResult.rows[0].total_usages}`);

    console.log('🎉 Coupon seeding completed!');
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    client.release();
  }
}

seedCoupons();

