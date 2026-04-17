const isSuperAdmin = (req, res, next) => {
    // req.user is set by your authMiddleware
    
    
    if (req.user && req.user.role === 'Super Admin') {
        next();
    } else {
        res.status(403).json({
            success: false,
            message: "Access Denied: Super Admins Only",
            role : req.user ? req.user.role : 'No role found'            
        });
    }
};

module.exports = isSuperAdmin;