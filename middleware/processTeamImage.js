const fs = require('fs/promises');
const path = require('path');

module.exports = async (req, res, next) => {
  if (req.files && req.files.length > 0) {
    const imageFile = req.files[0]; // single image, fieldname 'image'
    if (imageFile) {
      const base64Data = imageFile.buffer.toString('base64');
      req.body.image_base64 = `data:${imageFile.mimetype};base64,${base64Data}`;
    }
  }
  next();
};
