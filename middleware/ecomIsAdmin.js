const ecomIsAdmin = (req, res, next) => {
  // TODO: Add role field to ecom_user if needed
  // For now, distributor_code indicates admin level
  if (!req.user || !req.user.distributor_code) {
    return res.status(403).json({ status: false, error: 'Admin access required' });
  }
  next();
};

module.exports = ecomIsAdmin;

