const { Pool } = require('../config/db');

async function seedTeamData() {
  try {
    // Insert example data
    const teamData = [
      {
        name: 'Dr. Rajesh Kumar',
        title: 'Chairman & Founder',
        image: '/assets/images/reviewer-1.jpg',
        bio: 'Visionary leader with 20+ years in direct selling. Built multiple successful MLM networks across India.'
      }
    ];

    for (const member of teamData) {
      await pool.query(
        `INSERT INTO team_members (name, title, image, bio) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT DO NOTHING`,
        [member.name, member.title, member.image, member.bio]
      );
    }

    console.log('✅ Team member data seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding team data:', error);
  } finally {
    pool.end();
  }
}

seedTeamData();
