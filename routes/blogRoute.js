const express = require("express");
const router = express.Router();
const multer = require("multer");
const blogController = require("../controllers/blogController");

// ==================== CATEGORY ROUTES ====================
// Public - Get all categories
router.get("/categories", blogController.getAllCategories);
// Public - Get single category by ID
router.get("/categories/:id", blogController.getCategoryById);
// Admin - Create category
router.post("/categories", blogController.createCategory);
// Admin - Update category
router.put("/categories/:id", blogController.updateCategory);
// Admin - Delete category
router.delete("/categories/:id", blogController.deleteCategory);

// ==================== POST ROUTES ====================
// --- Public Routes ---
router.get("/", blogController.getAllPosts);
router.get("/:slug", blogController.getPostBySlug); // This now returns post + latest 6 products + comments
router.post("/comment", blogController.addComment); // Public can post comments

// --- Admin Routes ---
router.post("/", blogController.createPost);
router.get("/details/:slug", blogController.getPostDetails); // This now returns post + latest 6 products + comments
router.put("/:id", blogController.updatePost);
router.delete("/:id", blogController.deletePost);
router.put("/comment/approve/:commentId", blogController.approveComment); // Admin approves comments

module.exports = router;
