const db = require('../config/db');

exports.getBanners = async (req, res) => {
  try {
  } catch (error) {}
};

exports.addBanner = async (req, res) => {
  try {
  } catch (error) {}
};

exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
  } catch (error) {}
};

exports.getAllStaticData = async (req, res)=>{
  try {
        
    
    const result = await db.query(
      `SELECT id, title, slug, content, meta_title, meta_description, status, updated_at 
       FROM static_content 
       WHERE status = 'published'`,      
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Static content not found or not published' });
    }
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching static content:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
// static content controller
exports.getStaticData = async (req, res) => {
  try {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Slug is required' });
    }
    
    const result = await db.query(
      `SELECT id, title, slug, content, meta_title, meta_description, status, updated_at 
       FROM static_content 
       WHERE LOWER(slug) = LOWER($1) AND status = 'published'`,
      [slug]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Static content not found or not published' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching static content:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

exports.createStaticData = async (req, res) => {
  try {
    const { title, slug, content, meta_title, meta_description, status } = req.body;
    
    if (!title || !slug || !content) {
      return res.status(400).json({ success: false, message: 'Title, slug, and content are required' });
    }
    
    const normalizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    
    const result = await db.query(
      `INSERT INTO static_content (title, slug, content, meta_title, meta_description, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [title, normalizedSlug, content, meta_title, meta_description, status || 'published']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cannot create - slug already exists' });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Static content created successfully'
    });
  } catch (error) {
    console.error('Error creating static content:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

exports.updateStaticData = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, meta_title, meta_description, status } = req.body;
    
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Slug is required' });
    }
    
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    
    const normalizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    
    const result = await db.query(
      `UPDATE static_content 
       SET 
         title = $1,
         content = $2,
         meta_title = $3,
         meta_description = $4,
         status = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(slug) = LOWER($6)
       RETURNING *`,
      [title, content, meta_title, meta_description, status || 'published', normalizedSlug]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Static content not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Static content updated successfully'
    });
  } catch (error) {
    console.error('Error updating static content:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
