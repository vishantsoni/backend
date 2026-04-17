const fs = require('fs/promises');
const path = require('path');

module.exports = async (req, res, next) => {
  // Validate files: image types only, max 5MB each
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/pdf'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ status: false, error: `Invalid file type: ${file.mimetype}` });
      }
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ status: false, error: 'File too large (max 5MB)' });
      }
    }
  }
  next();
};
