const isAdminOrSuperAdmin = (req, res, next) => {
  if (
    req.user &&
    (req.user.role === "admin" || req.user.role === "Super Admin")
  ) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: "Access Denied: Admins Only",
      role: req.user ? req.user.role : "No role found",
    });
  }
};

module.exports = isAdminOrSuperAdmin;
