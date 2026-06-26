const isSuperAdmin = (req, res, next) => {
  // req.user is set by your authMiddleware
  if (!req.user) {
    return res.status(403).json({
      success: false,
      message: "Access Denied: Super Admins Only",
      role: "No user found",
    });
  }

  // Normalize role (some projects store different casing/strings)
  const role =
    typeof req.user.role === "string" ? req.user.role.trim().toLowerCase() : "";

  const isRoleSuperAdmin =
    role === "super admin" || role === "superadmin" || role === "super admin";

  // Permission-driven superadmin access
  // Your hasPermission middleware expects an array at req.user.permissions
  const permissions = Array.isArray(req.user.permissions)
    ? req.user.permissions
    : [];
  const hasAllPermissions = permissions.includes("*");

  // If you store a specific superadmin permission, add it here.
  // This keeps backward compatibility with permission-based setups.
  const hasSuperAdminPermission =
    permissions.includes("superadmin") || permissions.includes("SUPERADMIN");

  if (isRoleSuperAdmin || hasAllPermissions || hasSuperAdminPermission) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Access Denied: Super Admins Only",
    role: req.user ? req.user.role : "No role found",
  });
};

module.exports = isSuperAdmin;
