const db = require('../config/db');

async function seedAppSettings() {
  console.log('🌱 Seeding app_settings...');
  
  const seedData = [
    {
      key: 'id_card_assets',
      value: {
        welcome_letter_bg: '/assets/docs/welcome-bg.jpg',
        id_front: '/assets/docs/id-front.jpg',
        id_back: '/assets/docs/id-back.jpg'
      },
      category: 'design'
    },
    {
      key: 'geo_lock_config',
      value: {
        lat: 27.599,
        lng: 78.050,
        radius_meters: 5000,
        is_active: true
      },
      category: 'security'
    },
    {
      key: 'auth_policy',
      value: {
        max_failed_attempts: 3,
        lockout_duration_minutes: 15
      },
      category: 'security'
    },
    {
      key: 'sms_gateway',
      value: {
        base_url: 'https://api.sms-provider.com',
        api_key: 'YOUR_KEY_HERE',
        secret_key: 'YOUR_SECRET_HERE'
      },
      category: 'communication'
    },
    {
      key: 'sms_templates',
      value: {
        welcome: 'Welcome {name} to Ganesh Tech! Your ID is {user_id}.',
        otp: 'Your OTP for login is {otp}.'
      },
      category: 'communication'
    },
    {
      key: 'tax_config',
      value: {
        cgst_percent: 6,
        sgst_percent: 6
      },
      category: 'finance'
    }
  ];

  try {
    for (const item of seedData) {
      await db.query(
        `INSERT INTO app_settings (setting_key, setting_value, category) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (setting_key) DO NOTHING`,
        [item.key, item.value, item.category]
      );
    }
    
    const count = await db.query('SELECT COUNT(*)::int as count FROM app_settings');
    console.log(`✅ App settings seeded successfully! Total: ${count.rows[0].count}`);
  } catch (error) {
    console.error('❌ Error seeding app_settings:', error.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

seedAppSettings();

