module.exports = (requiredPermission) => {
  return (req, res, next) => {
    const permissions = req.user.permissions || [];
    if (permissions.includes("*") || permissions.includes(requiredPermission)) {
      next();
    } else {
      res
        .status(403)
        .json({ message: `Permission "${requiredPermission}" required` });
    }
  };
};
