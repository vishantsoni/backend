const db = require("../config/db");
const fs = require("fs/promises");
const pathModule = require("path");

const parseArrayField = (req, fieldName) => {
  const value = req.body[fieldName];

  if (!value || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .map((s) => parseInt(s))
      .filter((n) => !isNaN(n));
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .map((s) => parseInt(s))
    .filter((n) => !isNaN(n));
};

exports.getCategories = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM categories ORDER BY id ASC");
    res.status(200).json({
      status: true,
      message: "Categories fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug, status, parent_id } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Category name is required and must be a non-empty string",
      });
    }
    const result = await db.query(
      "INSERT INTO categories (name, slug, status, parent_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [
        name.trim(),
        slug || slug.trim().toLowerCase(),
        status || "active",
        parent_id || null,
      ],
    );
    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    // console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateCategory = async (req, res) => {
  try {
    const { id, name } = req.body;
    if (
      !id ||
      isNaN(parseInt(id)) ||
      !name ||
      typeof name !== "string" ||
      name.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) and non-empty name are required",
      });
    }
    const categoryId = parseInt(id);
    const result = await db.query(
      "UPDATE categories SET name = $1 WHERE id = $2 RETURNING *",
      [name.trim(), categoryId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) is required",
      });
    }
    const categoryId = parseInt(id);
    const result = await db.query(
      "DELETE FROM categories WHERE id = $1 RETURNING *",
      [categoryId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { status } = req.query;
    let whereClause = "WHERE 1=1";
    const values = [];

    if (status) {
      if (status === "all") {
        whereClause += " AND p.status IN ('active', 'inactive', 'trash')";
      } else {
        whereClause += ` AND p.status = $${values.length + 1}`;
        values.push(status);
      }
    }

    const result = await db.query(
      `
      SELECT 
        p.*, 
        c.name as category_name,        
        COUNT(v.id) AS variant_count,
        CASE 
          WHEN p.tax_id IS NOT NULL THEN 
            JSON_BUILD_OBJECT(
              'id', t.id,
              'name', t.tax_name,
              'percentage', t.tax_percentage
            )
          ELSE NULL 
        END AS tax_data
      FROM products p 
      LEFT JOIN pro_variants v ON p.id = v.product_id
      JOIN categories c ON p.cat_id = c.id
      LEFT JOIN tax_settings t ON p.tax_id = t.id
      ${whereClause}
      GROUP BY p.id, c.name,t.id, t.tax_name, t.tax_percentage
      ORDER BY p.id ASC
      `,
      values,
    );

    res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// distributor products
exports.getProductsForDistributor = async (req, res) => {
  try {
    const { status = "active" } = req.query;
    let whereClause = "WHERE 1=1";
    const values = [];

    // Handling Status Filter
    if (status !== "all") {
      values.push(status);
      whereClause += ` AND p.status = $${values.length}`;
    } else {
      whereClause += " AND p.status IN ('active', 'inactive', 'trash')";
    }

    const query = `
      SELECT 
        jsonb_build_object(
          'id', p.id,
          'cat_id', p.cat_id,
          'name', p.name,
          'description', p.description,
          'slug', p.slug,
          'f_image', p.f_image,
          'g_image', p.g_image,
          'tax_id', p.tax_id,
          'unit_price', p.base_price,
          'discounted_price', COALESCE(p.discounted_price, p.base_price),
          -- Best Practice: Backend calculates the final display price
          'base_price', ROUND(
              (CASE WHEN p.discounted_price > 0 THEN p.discounted_price ELSE p.base_price END 
              * (1 + COALESCE(t.tax_percentage, 0) / 100))::numeric, 2
            ),
          'subcategories', p.subcategories,
          'attributes', p.attributes,
          'status', p.status,
          'created_at', p.created_at
        ) AS product,
        
        jsonb_build_object(
          'id', c.id, 
          'name', c.name, 
          'slug', c.slug
        ) AS category,

        jsonb_build_object(
          'id', t.id,
          'name', t.tax_name,
          'rate', t.tax_percentage,
          -- Calculate the exact tax amount for the UI breakup
          'tax_amount', ROUND((COALESCE(p.discounted_price, p.base_price) * (COALESCE(t.tax_percentage, 0) / 100))::numeric, 2)
        ) AS tax_data,

        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('id', sc.id, 'name', sc.name, 'slug', sc.slug)
          )
          FROM categories sc 
          WHERE sc.id = ANY(p.subcategories)
        ), '[]'::jsonb) AS subcategories_list,
        
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id, 
              'name', a.name,
              'values', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object('id', av.id, 'value', av.value)
                )
                FROM attr_values av 
                WHERE av.attr_id = a.id
              ), '[]'::jsonb)
            )
          )
          FROM attributes a 
          WHERE a.id = ANY(p.attributes)
        ), '[]'::jsonb) AS product_attributes,
        
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', v.id,
              'sku', v.sku,
              'base_price', v.price,
              'stock', v.stock,
              'price', ROUND((COALESCE(v.price) * (1 + COALESCE(t.tax_percentage, 0) / 100))::numeric, 2),
              'bv_point', v.bv_point,
              'attr_combinations', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'attr_value_id', vam.attr_value_id,
                    'attr_id', av.attr_id,
                    'value', av.value
                  ) ORDER BY av.attr_id
                )
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id
                WHERE vam.variant_id = v.id
              ), '[]'::jsonb)
            )
          )
          FROM pro_variants v 
          WHERE v.product_id = p.id
        ), '[]'::jsonb) AS variants,
        
        COUNT(v2.id) AS variant_count
        
      FROM products p 
      LEFT JOIN categories c ON p.cat_id = c.id
      LEFT JOIN pro_variants v2 ON p.id = v2.product_id
      LEFT JOIN tax_settings t ON p.tax_id = t.id
      ${whereClause}
      GROUP BY p.id, c.id, t.id, c.name, c.slug, t.tax_percentage, t.tax_name
    `;

    const result = await db.query(query, values);

    res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      discounted_price,
      cat_id,
      status,
      tax_id,
      variants: variantsStr,
    } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Product name required" });
    }

    // Insert product
    const subcategories = parseArrayField(req, "subcategories");
    const attributes = parseArrayField(req, "attributes");

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const uploadDir = pathModule.join("uploads", "products", slug);
    await fs.mkdir(uploadDir, { recursive: true });

    // Parse variants
    let parsedVariants;
    try {
      parsedVariants = JSON.parse(variantsStr || "[]");
    } catch {
      return res
        .status(400)
        .json({ success: false, message: "Invalid variants JSON" });
    }

    // Handle images (base64)
    let fImagePath = null;
    const fImageBase64 = req.body.f_image;
    if (fImageBase64 && fImageBase64.startsWith("data:")) {
      const base64Data = fImageBase64.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      fImagePath = `${process.env.APP_URL}/uploads/products/${slug}/featured.jpg`;
      await fs.writeFile(pathModule.join(uploadDir, "featured.jpg"), buffer);
    }

    const gImagePaths = [];
    for (let i = 0; i < 3; i++) {
      const gImageKey = `g_image[${i}]`;
      const gImageBase64 = req.body[gImageKey];
      if (gImageBase64 && gImageBase64.startsWith("data:")) {
        const base64Data = gImageBase64.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const fileName = `gallery_${i + 1}.jpg`;
        const filePath = `${process.env.APP_URL}/uploads/products/${slug}/${fileName}`;
        await fs.writeFile(pathModule.join(uploadDir, fileName), buffer);
        gImagePaths.push(filePath);
      }
    }

    const basePrice = parseFloat(price) || 0;
    const b_discounted_price = parseFloat(discounted_price) || 0;
    const result = await db.query(
      `INSERT INTO products (cat_id, name, description, f_image, g_image, status, tax_id, base_price, subcategories, attributes, discounted_price, slug) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        cat_id || null,
        name.trim(),
        description || null,
        fImagePath,
        gImagePaths,
        status || "active",
        tax_id || null,
        basePrice,
        subcategories,
        attributes,
        b_discounted_price,
        slug,
      ],
    );
    const product = result.rows[0];

    // Insert variants and mappings
    const createdVariants = [];
    for (const variant of parsedVariants) {
      const {
        sku,
        price: vPrice,
        bv_point = 0,
        stock = 0,
        attr_mappings = [],
      } = variant;
      const variantPrice = parseFloat(vPrice) || 0;
      const variantResult = await db.query(
        `INSERT INTO pro_variants (product_id, sku, price, bv_point, stock) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [product.id, sku, variantPrice, bv_point, stock],
      );
      const v = variantResult.rows[0];

      // Attr mappings
      for (const mapping of attr_mappings) {
        const { attr_id, value_id } = mapping;
        // Validate attr_value_id exists
        const validCheck = await db.query(
          "SELECT id FROM attr_values WHERE id = $1",
          [value_id],
        );
        if (validCheck.rowCount === 0) {
          console.warn(
            `Invalid attr_value_id: ${value_id} for variant ${v.id}`,
          );
          continue;
        }
        await db.query(
          "INSERT INTO variant_attr_mapping (variant_id, attr_value_id) VALUES ($1, $2)",
          [v.id, value_id],
        );
      }
      createdVariants.push(v);
    }

    product.variants = createdVariants;

    res.status(201).json({
      success: true,
      message: "Product created successfully with variants",
      data: product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) is required",
      });
    }
    const productId = parseInt(id);
    const result = await db.query(
      `
      SELECT 
      p.*, 
      COUNT(v.id) AS variant_count
      FROM products p 
      LEFT JOIN pro_variants v ON p.id = v.product_id
      WHERE p.id = $1
      GROUP BY p.id
    `,
      [productId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getProductByslug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Valid slug is required",
      });
    }
    const result = await db.query(
      `
      SELECT 
        jsonb_build_object(
          'id', p.id,
          'cat_id', p.cat_id,
          'name', p.name,
          'description', p.description,
          'slug', p.slug,
          'f_image', p.f_image,
          'g_image', p.g_image,
          'tax_id', p.tax_id,
          'base_price', p.base_price,
          'discounted_price', COALESCE(p.discounted_price, p.base_price),
          'subcategories', p.subcategories,
          'attributes', p.attributes,
          'status', p.status,
          'created_at', p.created_at
        ) AS product,
        
        jsonb_build_object(
          'id', c.id, 
          'name', c.name, 
          'slug', c.slug
        ) AS category,
        
        -- Tax Data Population
        CASE 
          WHEN p.tax_id IS NOT NULL THEN 
            jsonb_build_object(
              'id', t.id,
              'name', t.tax_name,
              'percentage', t.tax_percentage
            )
          ELSE NULL 
        END AS tax_data,

        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('id', sc.id, 'name', sc.name, 'slug', sc.slug)
          )
          FROM categories sc 
          WHERE sc.id = ANY(p.subcategories)
        ), '[]'::jsonb) AS subcategories,
        
        -- Product attributes WITH their values for frontend dropdowns
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id, 
              'name', a.name,
              'values', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object('id', av.id, 'value', av.value)
                )
                FROM attr_values av 
                WHERE av.attr_id = a.id
              ), '[]'::jsonb)
            )
          )
          FROM attributes a 
          WHERE a.id = ANY(p.attributes)
        ), '[]'::jsonb) AS product_attributes,
        
        -- ALL variants WITH attr_combinations for frontend matching
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', v.id,
              'sku', v.sku,
              'price', v.price,
              'stock', v.stock,
              'bv_point', v.bv_point,
              'attr_combinations', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'attr_value_id', vam.attr_value_id,
                    'attr_id', av.attr_id,
                    'value', av.value
                  ) ORDER BY av.attr_id
                )
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id
                WHERE vam.variant_id = v.id
              ), '[]'::jsonb)
            )
          )
          FROM pro_variants v 
          WHERE v.product_id = p.id
        ), '[]'::jsonb) AS variants,
        
        COUNT(v2.id) AS variant_count
        
      FROM products p 
      LEFT JOIN categories c ON p.cat_id = c.id
      LEFT JOIN pro_variants v2 ON p.id = v2.product_id
      LEFT JOIN tax_settings t ON p.tax_id = t.id
      WHERE p.slug = $1 
      GROUP BY p.id, c.id, p.name, p.description, p.f_image, p.g_image, p.tax_id, 
               p.base_price, p.discounted_price, p.subcategories, p.attributes, 
               p.status, p.created_at, c.name, c.slug,
               t.id, t.tax_name, t.tax_percentage
    `,
      [slug],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Flatten the single row result
    const data = result.rows[0];

    res.status(200).json({
      success: true,
      message: "Product fetched successfully with attribute-variant mappings",
      data: data,
    });
  } catch (error) {
    console.error("Error fetching product by slug:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message, // Include for debugging
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, cat_id, f_image, g_image, status, tax_id } =
      req.body;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) is required",
      });
    }
    const productId = parseInt(id);
    const updates = [];
    const values = [];
    let paramIndex = 1;
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid name" });
      }
      updates.push(`name = $${paramIndex}`);
      values.push(name.trim());
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }
    if (cat_id !== undefined) {
      updates.push(`cat_id = $${paramIndex}`);
      values.push(cat_id || null);
      paramIndex++;
    }
    if (f_image !== undefined) {
      updates.push(`f_image = $${paramIndex}`);
      values.push(f_image);
      paramIndex++;
    }
    if (g_image !== undefined) {
      updates.push(`g_image = $${paramIndex}`);
      values.push(Array.isArray(g_image) ? g_image : []);
      paramIndex++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }
    if (tax_id !== undefined) {
      updates.push(`tax_id = $${paramIndex}`);
      values.push(tax_id || null);
      paramIndex++;
    }
    values.push(productId);
    const query = `UPDATE products SET ${updates.join(
      ", ",
    )} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) is required",
      });
    }
    const productId = parseInt(id);
    const result = await db.query(
      "UPDATE products SET status = 'trash' WHERE id = $1 RETURNING *",
      [productId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
