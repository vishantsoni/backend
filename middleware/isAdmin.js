const isAdmin = (req, res, next) => {
    // req.user is set by your authMiddleware
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Access Denied: Admins Only" });
    }
};

module.exports = isAdmin;