const pool = require("../config/db");
const slugify = require("slugify");
const fs = require("fs/promises");
const path = require("path");

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function saveBlogFile(file) {
  const uploadDir = "uploads/blog";
  await fs.mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
  const filePath = path.join(uploadDir, fileName);

  await fs.writeFile(filePath, file.buffer);

  return `${process.env.APP_URL}/${uploadDir}/${fileName}`;
}

function validateBlogFile(file, fieldName) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return `Invalid file type for ${fieldName}: ${file.mimetype}. Allowed types: jpeg, jpg, png, webp, gif`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large for ${fieldName} (max 5MB)`;
  }
  return null;
}

const blogController = {
  // ==================== CATEGORY METHODS ====================

  // Fetch all categories
  getAllCategories: async (req, res) => {
    try {
      const query = `
        SELECT * FROM blog_categories 
        ORDER BY name ASC;
      `;
      const { rows } = await pool.query(query);
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Fetch single category by ID
  getCategoryById: async (req, res) => {
    const { id } = req.params;
    try {
      const query = `SELECT * FROM blog_categories WHERE id = $1`;
      const { rows } = await pool.query(query, [id]);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Create Category (Admin)
  createCategory: async (req, res) => {
    const { name } = req.body;
    const slug = slugify(name, { lower: true, strict: true });

    try {
      const query = `
        INSERT INTO blog_categories (name, slug)
        VALUES ($1, $2) RETURNING *;
      `;
      const { rows } = await pool.query(query, [name, slug]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        // Unique violation
        return res
          .status(400)
          .json({ success: false, message: "Category already exists" });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update Category (Admin)
  updateCategory: async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const slug = name ? slugify(name, { lower: true, strict: true }) : null;

    try {
      const query = `
        UPDATE blog_categories 
        SET name = COALESCE($1, name), slug = COALESCE($2, slug)
        WHERE id = $3 RETURNING *;
      `;
      const { rows } = await pool.query(query, [name, slug, id]);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ success: false, message: "Category name already exists" });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Delete Category (Admin)
  deleteCategory: async (req, res) => {
    const { id } = req.params;
    try {
      const query = `DELETE FROM blog_categories WHERE id = $1 RETURNING id`;
      const { rows } = await pool.query(query, [id]);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      res
        .status(200)
        .json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ==================== POST METHODS ====================

  // Fetch all public blogs
  getAllPosts: async (req, res) => {
    try {
      const query = `
                SELECT bp.*, bc.name as category_name 
                FROM blog_posts bp
                LEFT JOIN blog_categories bc ON bp.category_id = bc.id
                WHERE bp.status = 'published'
                ORDER BY bp.created_at DESC;
            `;
      const { rows: posts } = await pool.query(query);

      // Fetch approved comments for each post
      for (const post of posts) {
        const commentQuery = `
          SELECT user_full_name, comment_text, created_at 
          FROM blog_comments 
          WHERE post_id = $1 AND is_approved = true 
          ORDER BY created_at DESC;
        `;
        const { rows: comments } = await pool.query(commentQuery, [post.id]);
        post.comments = comments;
      }

      res.status(200).json({ success: true, data: posts });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Fetch single blog + Latest 6 Products + Approved Comments
  getPostBySlug: async (req, res) => {
    const { slug } = req.params;
    try {
      // 1. Get Blog Detail
      // const blogQuery = `SELECT * FROM blog_posts LEFT JOIN WHERE slug = $1 AND status = 'published'`;
      const blogQuery = `SELECT bp.*, bc.name as category_name 
                FROM blog_posts bp
                LEFT JOIN blog_categories bc ON bp.category_id = bc.id 
                WHERE bp.slug = $1 AND bp.status = 'published'
                `;
      const blogResult = await pool.query(blogQuery, [slug]);

      if (blogResult.rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }
      const post = blogResult.rows[0];

      // 2. Get Latest 6 Products (Dynamic - No hard linking needed)
      const productQuery = `
                SELECT id, name,  f_image, slug 
                FROM products 
                WHERE status = 'active' 
                ORDER BY created_at DESC 
                LIMIT 6;
            `;
      const products = await pool.query(productQuery);

      // 3. Get Approved Comments
      const commentQuery = `
                SELECT user_full_name, comment_text, created_at 
                FROM blog_comments 
                WHERE post_id = $1 AND is_approved = true 
                ORDER BY created_at DESC;
            `;
      const comments = await pool.query(commentQuery, [post.id]);

      res.status(200).json({
        success: true,
        data: {
          post,
          relatedProducts: products.rows,
          comments: comments.rows,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPostDetails: async (req, res) => {
    const { slug } = req.params;
    try {
      // 1. Get Blog Detail
      const blogQuery = `SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published'`;
      const blogResult = await pool.query(blogQuery, [slug]);

      if (blogResult.rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }
      const post = blogResult.rows[0];

      // 2. Get Latest 6 Products (Dynamic - No hard linking needed)

      // 3. Get Approved Comments
      const commentQuery = `
                SELECT user_full_name, comment_text, created_at 
                FROM blog_comments 
                WHERE post_id = $1 AND is_approved = true 
                ORDER BY created_at DESC;
            `;
      const comments = await pool.query(commentQuery, [post.id]);

      res.status(200).json({
        success: true,
        // data: {
        //   post,
        //   comments: comments.rows,
        // },
        data: post,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Add a comment (Public)
  addComment: async (req, res) => {
    const { post_id, user_full_name, user_phone, user_email, comment_text } =
      req.body;
    try {
      const query = `
                INSERT INTO blog_comments (post_id, user_full_name, user_phone, user_email, comment_text)
                VALUES ($1, $2, $3, $4, $5) RETURNING id;
            `;
      await pool.query(query, [
        post_id,
        user_full_name,
        user_phone,
        user_email,
        comment_text,
      ]);
      res.status(201).json({
        success: true,
        message: "Comment submitted. Waiting for admin approval.",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Create Post (Admin)
  createPost: async (req, res) => {
    const { title, content, category_id, featured_image } = req.body;
    const slug = slugify(title, { lower: true, strict: true });

    // Handle image file upload from req.files or req.file
    let imageUrl = featured_image || null;

    // Try req.file first (from upload.single)
    if (req.file && req.file.fieldname === "featured_image") {
      const validationError = validateBlogFile(req.file, "featured_image");
      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }
      imageUrl = await saveBlogFile(req.file);
    }
    // Try req.files array (from upload.array)
    else if (req.files && req.files.length > 0) {
      const imageFile = req.files.find((f) => f.fieldname === "featured_image");
      if (imageFile) {
        const validationError = validateBlogFile(imageFile, "featured_image");
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        imageUrl = await saveBlogFile(imageFile);
      }
    }

    // Fallback to base64 if no file uploaded
    if (
      !imageUrl &&
      featured_image &&
      featured_image.startsWith("data:image")
    ) {
      try {
        const uploadDir = path.join("uploads", "blog");
        await fs.mkdir(uploadDir, { recursive: true });

        const base64Data = featured_image.replace(
          /^data:image\/\w+;base64,/,
          "",
        );
        const buffer = Buffer.from(base64Data, "base64");

        const ext =
          featured_image.match(/^data:image\/(\w+);base64,/)[1] || "jpg";
        const fileName = `${Date.now()}_${slug}.${ext}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.writeFile(filePath, buffer);
        imageUrl = `${process.env.APP_URL}/uploads/blog/${fileName}`;
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return res
          .status(500)
          .json({ success: false, message: "Failed to upload image" });
      }
    }

    try {
      const query = `
                INSERT INTO blog_posts (title, slug, content, category_id, featured_image)
                VALUES ($1, $2, $3, $4, $5) RETURNING *;
            `;
      const { rows } = await pool.query(query, [
        title,
        slug,
        content,
        category_id,
        imageUrl,
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update Post (Admin)
  updatePost: async (req, res) => {
    const { id } = req.params;
    const { title, content, category_id, featured_image, status } = req.body;
    const slug = title ? slugify(title, { lower: true, strict: true }) : null;

    // Handle image file upload from req.files or req.file
    let imageUrl = featured_image || null;

    // Try req.file first (from upload.single)
    if (req.file && req.file.fieldname === "featured_image") {
      const validationError = validateBlogFile(req.file, "featured_image");
      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }
      imageUrl = await saveBlogFile(req.file);
    }
    // Try req.files array (from upload.array)
    else if (req.files && req.files.length > 0) {
      const imageFile = req.files.find((f) => f.fieldname === "featured_image");
      if (imageFile) {
        const validationError = validateBlogFile(imageFile, "featured_image");
        if (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError,
          });
        }
        imageUrl = await saveBlogFile(imageFile);
      }
    }

    // Fallback to base64 if no file uploaded
    if (
      !imageUrl &&
      featured_image &&
      featured_image.startsWith("data:image")
    ) {
      try {
        const uploadDir = path.join("uploads", "blog");
        await fs.mkdir(uploadDir, { recursive: true });

        const base64Data = featured_image.replace(
          /^data:image\/\w+;base64,/,
          "",
        );
        const buffer = Buffer.from(base64Data, "base64");

        const ext =
          featured_image.match(/^data:image\/(\w+);base64,/)[1] || "jpg";
        const fileName = `${Date.now()}_${slug || "update"}.${ext}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.writeFile(filePath, buffer);
        imageUrl = `${process.env.APP_URL}/uploads/blog/${fileName}`;
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return res
          .status(500)
          .json({ success: false, message: "Failed to upload image" });
      }
    }

    try {
      const query = `
                UPDATE blog_posts 
                SET title = COALESCE($1, title), content = COALESCE($2, content), category_id = COALESCE($3, category_id), featured_image = COALESCE($4, featured_image), status = COALESCE($5, status), updated_at = NOW()
                WHERE id = $6 RETURNING *;
            `;
      const { rows } = await pool.query(query, [
        title,
        content,
        category_id,
        imageUrl,
        status,
        id,
      ]);
      res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Delete Post (Admin)
  deletePost: async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM blog_posts WHERE id = $1", [id]);
      res.status(200).json({
        success: true,
        message: "Post and associated comments deleted.",
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Approve Comment (Admin)
  approveComment: async (req, res) => {
    const { commentId } = req.params;
    try {
      await pool.query(
        "UPDATE blog_comments SET is_approved = true WHERE id = $1",
        [commentId],
      );
      res
        .status(200)
        .json({ success: true, message: "Comment is now public." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

module.exports = blogController;
