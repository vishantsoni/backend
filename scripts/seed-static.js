const db = require('../config/db');

const staticContents = [
  {
    title: 'About Us',
    slug: 'about-us',
    content: `
<!DOCTYPE html>
<html>
<head>
  <title>About Us - Ganesh Tech MLM</title>
</head>
<body>
  <div class="container">
    <h1>About Ganesh Tech Solution MLM</h1>
    <p>Welcome to our revolutionary MLM platform built with cutting-edge technology.</p>
    <p>Our mission is to empower distributors with the best products and business opportunity.</p>
    <ul>
      <li>Premium Health & Hygiene Products</li>
      <li>Generous Commission Structure</li>
      <li>Advanced Binary MLM Plan</li>
      <li>24/7 Support</li>
    </ul>
    <p>Join thousands of satisfied distributors today!</p>
  </div>
</body>
</html>`.trim(),
    meta_title: 'About Us - Ganesh Tech MLM Platform',
    meta_description: 'Learn about our MLM company, products, and business opportunity.'
  },
  {
    title: 'Contact Us',
    slug: 'contact-us',
    content: `
<!DOCTYPE html>
<html>
<head>
  <title>Contact Us - Ganesh Tech MLM</title>
</head>
<body>
  <div class="container">
    <h1>Contact Us</h1>
    <p>Have questions? Get in touch!</p>
    <div class="contact-info">
      <p><strong>Email:</strong> support@ganeshtechmlm.com</p>
      <p><strong>Phone:</strong> +91-XXXXXXXXXX</p>
      <p><strong>Office:</strong> [Office Address]</p>
    </div>
    <form class="contact-form">
      <input type="text" placeholder="Your Name" required>
      <input type="email" placeholder="Your Email" required>
      <textarea placeholder="Your Message" required></textarea>
      <button type="submit">Send Message</button>
    </form>
  </div>
</body>
</html>`.trim(),
    meta_title: 'Contact Us - Ganesh Tech MLM',
    meta_description: 'Contact our support team for help with your MLM business.'
  },
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    content: `
<!DOCTYPE html>
<html>
<head>
  <title>Privacy Policy - Ganesh Tech MLM</title>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p>Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information.</p>
    <h2>1. Information We Collect</h2>
    <p>We collect personal information like name, email, phone, and Aadhaar for account creation and verification.</p>
    
    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>Process orders and payments</li>
      <li>Calculate commissions</li>
      <li>Verify KYC documents</li>
      <li>Send notifications</li>
    </ul>
    
    <h2>3. Data Security</h2>
    <p>All data is encrypted and stored securely in compliance with Indian data protection laws.</p>
    
    <p>Last updated: ${new Date().toISOString().split('T')[0]}</p>
  </div>
</body>
</html>`.trim(),
    meta_title: 'Privacy Policy - Ganesh Tech MLM',
    meta_description: 'Read our Privacy Policy to understand how we protect your data.'
  },
  {
    title: 'Terms & Conditions',
    slug: 'terms-conditions',
    content: `
<!DOCTYPE html>
<html>
<head>
  <title>Terms & Conditions - Ganesh Tech MLM</title>
</head>
<body>
  <div class="container">
    <h1>Terms & Conditions</h1>
    <p>By using our platform, you agree to these terms.</p>
    
    <h2>1. Eligibility</h2>
    <p>You must be 18+ years old and resident of India to join.</p>
    
    <h2>2. Distributor Responsibilities</h2>
    <ul>
      <li>Complete KYC verification</li>
      <li>Follow ethical business practices</li>
      <li>No spamming or false claims</li>
    </ul>
    
    <h2>3. Commission Payouts</h2>
    <p>Commissions paid weekly after verification. Minimum payout threshold applies.</p>
    
    <h2>4. Product Returns</h2>
    <p>7-day return policy for unopened products.</p>
    
    <p>We reserve the right to terminate accounts violating terms.</p>
    <p>Last updated: ${new Date().toISOString().split('T')[0]}</p>
  </div>
</body>
</html>`.trim(),
    meta_title: 'Terms & Conditions - Ganesh Tech MLM',
    meta_description: 'Read our Terms & Conditions before joining our MLM platform.'
  }
];

async function seedStaticContent() {
  try {
    console.log('Seeding static content...');
    for (const item of staticContents) {
      await db.query(
        `INSERT INTO static_content (title, slug, content, meta_title, meta_description, status)
         VALUES ($1, $2, $3, $4, $5, 'published')
         ON CONFLICT (slug) DO NOTHING`,
        [item.title, item.slug, item.content, item.meta_title, item.meta_description]
      );
      console.log(`✅ Seeded: ${item.slug}`);
    }
    console.log('🎉 Static content seeded successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
  } finally {
    await db.end();
  }
}

seedStaticContent();

